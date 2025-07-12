#!/usr/bin/env node

const fs = require('fs');
const readline = require('readline');

/**
 * 终极版本：完美处理模型信息的转换器
 */

function extractAllEventsFromBinary(bodyRaw) {
  try {
    const events = [];
    const pattern = '{"bytes":';
    let pos = 0;
    
    while (pos < bodyRaw.length) {
      const bytesStart = bodyRaw.indexOf(pattern, pos);
      if (bytesStart === -1) break;
      
      let braceCount = 0;
      let inString = false;
      let escaped = false;
      let jsonEnd = bytesStart;
      
      for (let i = bytesStart; i < bodyRaw.length; i++) {
        const char = bodyRaw[i];
        
        if (!escaped) {
          if (char === '"' && !inString) {
            inString = true;
          } else if (char === '"' && inString) {
            inString = false;
          } else if (!inString) {
            if (char === '{') {
              braceCount++;
            } else if (char === '}') {
              braceCount--;
              if (braceCount === 0) {
                jsonEnd = i + 1;
                break;
              }
            }
          }
          escaped = (char === '\\' && inString);
        } else {
          escaped = false;
        }
      }
      
      if (jsonEnd > bytesStart) {
        try {
          const jsonStr = bodyRaw.substring(bytesStart, jsonEnd);
          const payload = JSON.parse(jsonStr);
          
          if (payload.bytes) {
            const decodedData = Buffer.from(payload.bytes, 'base64').toString('utf8');
            const eventData = JSON.parse(decodedData);
            
            // 转换message ID
            if (eventData.message && eventData.message.id) {
              eventData.message.id = eventData.message.id.replace('msg_bdrk_', 'msg_');
            }
            
            // 移除AWS特定metadata
            if (eventData['amazon-bedrock-invocationMetrics']) {
              delete eventData['amazon-bedrock-invocationMetrics'];
            }
            
            events.push(`event: ${eventData.type}`);
            events.push(`data: ${JSON.stringify(eventData)}`);
            events.push('');
          }
        } catch (e) {
          console.error('解析JSON失败 at position', bytesStart, ':', e.message);
        }
        pos = jsonEnd;
      } else {
        pos = bytesStart + 1;
      }
    }
    
    return events.join('\n');
  } catch (e) {
    console.error('提取事件失败:', e.message);
    return '';
  }
}

function convertBedrockModelToAnthropic(bedrockModel) {
  const modelMappings = {
    'us.anthropic.claude-3-sonnet-20240229-v1:0': 'claude-3-sonnet-20240229',
    'us.anthropic.claude-3-opus-20240229-v1:0': 'claude-3-opus-20240229',
    'us.anthropic.claude-3-haiku-20240307-v1:0': 'claude-3-haiku-20240307',
    'us.anthropic.claude-3-5-sonnet-20240620-v1:0': 'claude-3-5-sonnet-20240620',
    'us.anthropic.claude-3-5-sonnet-20241022-v2:0': 'claude-3-5-sonnet-20241022',
    'us.anthropic.claude-3-5-haiku-20241022-v1:0': 'claude-3-5-haiku-20241022',
    'us.anthropic.claude-sonnet-4-20250514-v1:0': 'claude-sonnet-4-20250514',
    'us.anthropic.claude-opus-4-20250514-v1:0': 'claude-opus-4-20250514',
    'us.anthropic.claude-3-7-sonnet-20250219-v1:0': 'claude-3-7-sonnet-20250219'
  };
  
  if (modelMappings[bedrockModel]) {
    return modelMappings[bedrockModel];
  } else if (bedrockModel && bedrockModel.includes('anthropic.claude')) {
    const match = bedrockModel.match(/anthropic\.(claude-[^:]+)/);
    if (match) {
      return match[1];
    }
  }
  
  return bedrockModel;
}

function convertEntry(line) {
  try {
    const entry = JSON.parse(line);
    const converted = JSON.parse(JSON.stringify(entry));
    let originalModel = null;
    
    // 转换请求
    if (converted.request) {
      // 只对模型对话请求进行转换
      if (converted.request.url && converted.request.url.includes('bedrock-runtime') && 
          converted.request.url.includes('/model/')) {
        // 从URL中提取模型信息
        const urlMatch = converted.request.url.match(/\/model\/([^\/]+)\//);
        if (urlMatch) {
          originalModel = urlMatch[1];
        }
        converted.request.url = 'https://api.anthropic.com/v1/messages';
      }
      // 非对话请求保持原URL不变
      
      // 只对模型对话请求转换headers和body
      if (originalModel) {
        // 转换headers
        if (converted.request.headers) {
          delete converted.request.headers['authorization'];
          delete converted.request.headers['x-amz-date'];
          delete converted.request.headers['x-amz-content-sha256'];
          delete converted.request.headers['amz-sdk-invocation-id'];
          delete converted.request.headers['amz-sdk-request'];
          delete converted.request.headers['x-amz-user-agent'];
          
          converted.request.headers['x-api-key'] = 'sk-ant-api03-dummy-key';
          converted.request.headers['anthropic-version'] = '2023-06-01';
        }
        
        // 转换request body - 添加模型信息
        if (converted.request.body) {
          if (converted.request.body.model) {
            originalModel = converted.request.body.model;
          }
          // 添加从URL提取的模型信息到request.body
          if (originalModel) {
            converted.request.body.model = convertBedrockModelToAnthropic(originalModel);
          }
          
          if (converted.request.body.anthropic_version) {
            delete converted.request.body.anthropic_version;
          }
        }
      }
    }
    
    // 只对模型对话请求转换响应
    if (converted.response && originalModel) {
      const isStreaming = converted.response.headers && 
        converted.response.headers['content-type'] === 'application/vnd.amazon.eventstream';
      
      if (isStreaming && converted.response.body_raw) {
        // 转换streaming响应
        const sseData = extractAllEventsFromBinary(converted.response.body_raw);
        if (sseData.trim()) {
          converted.response.body_raw = sseData;
          converted.response.headers['content-type'] = 'text/event-stream';
          
          // 关键！！！为所有streaming响应添加response.body字段
          // 使用原始模型信息或转换后的模型信息
          const model = originalModel ? convertBedrockModelToAnthropic(originalModel) : 
                       (converted.request?.body?.model || 'claude-sonnet-4-20250514');
          converted.response.body = {
            model: model,
            type: 'message',
            role: 'assistant'
          };
        }
      }
      
      // 转换非streaming响应
      if (converted.response.body && typeof converted.response.body === 'object') {
        if (converted.response.body.id) {
          converted.response.body.id = converted.response.body.id.replace('msg_bdrk_', 'msg_');
        }
        if (converted.response.body.model) {
          converted.response.body.model = convertBedrockModelToAnthropic(converted.response.body.model);
        } else if (originalModel) {
          // 如果response中没有model但request中有，补充上
          converted.response.body.model = convertBedrockModelToAnthropic(originalModel);
        }
        if (converted.response.body['amazon-bedrock-invocationMetrics']) {
          delete converted.response.body['amazon-bedrock-invocationMetrics'];
        }
      }
      
      // 清理响应headers
      if (converted.response.headers) {
        delete converted.response.headers['x-amzn-requestid'];
        delete converted.response.headers['x-amzn-bedrock-content-type'];
      }
    }
    
    return JSON.stringify(converted);
  } catch (e) {
    console.error('转换失败:', e.message);
    return line;
  }
}

async function main() {
  const inputFile = process.argv[2];
  
  if (!inputFile) {
    console.error('用法: node bedrock-converter-ultimate.js <input.jsonl> > <output.jsonl>');
    process.exit(1);
  }
  
  if (!fs.existsSync(inputFile)) {
    console.error(`文件不存在: ${inputFile}`);
    process.exit(1);
  }
  
  const fileStream = fs.createReadStream(inputFile);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });
  
  for await (const line of rl) {
    if (line.trim()) {
      const converted = convertEntry(line);
      console.log(converted);
    }
  }
}

if (require.main === module) {
  main().catch(console.error);
}