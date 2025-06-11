/**
 * WebSocket service for communicating with the Diffy server
 */
export class WebSocketService extends EventTarget {
	private ws: WebSocket | null = null;
	private connected = false;
	private reconnectInterval: number | null = null;
	private reconnectDelay = 1000;
	private maxReconnectDelay = 30000;

	constructor() {
		super();
	}

	async connect(): Promise<void> {
		const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
		const port = window.location.port ? `:${window.location.port}` : "";
		const wsUrl = `${protocol}//${window.location.hostname}${port}`;

		console.log(`🔌 Connecting to WebSocket: ${wsUrl}`);

		try {
			this.ws = new WebSocket(wsUrl);
			this.setupEventHandlers();
		} catch (error) {
			console.error("Failed to create WebSocket:", error);
			this.scheduleReconnect();
		}
	}

	private setupEventHandlers() {
		if (!this.ws) return;

		this.ws.onopen = () => {
			console.log("✅ WebSocket connected");
			this.connected = true;
			this.reconnectDelay = 1000;
			this.clearReconnectInterval();
			this.dispatchEvent(
				new CustomEvent("connection-status", {
					detail: { connected: true },
				}),
			);
		};

		this.ws.onclose = (event) => {
			console.log("❌ WebSocket disconnected:", event.code, event.reason);
			this.connected = false;
			this.dispatchEvent(
				new CustomEvent("connection-status", {
					detail: { connected: false },
				}),
			);

			if (event.code !== 1000) {
				console.log("🔄 WebSocket closed unexpectedly, will attempt to reconnect");
				this.scheduleReconnect();
			}
		};

		this.ws.onerror = (error) => {
			console.error("❌ WebSocket error:", error);
		};

		this.ws.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data);
				this.handleMessage(data);
			} catch (error) {
				console.error("Failed to parse WebSocket message:", error);
			}
		};
	}

	private handleMessage(data: any) {
		console.log("📥 WebSocket message:", data);

		switch (data.type) {
			case "stateRestore":
				this.dispatchEvent(new CustomEvent("state-restore", { detail: data }));
				break;

			case "fileUpdate":
				this.dispatchEvent(new CustomEvent("file-update", { detail: data }));
				break;

			case "openFile":
				this.dispatchEvent(new CustomEvent("open-file", { detail: data }));
				break;

			case "closeFile":
				this.dispatchEvent(new CustomEvent("close-file", { detail: data }));
				break;

			case "highlightFile":
				this.dispatchEvent(new CustomEvent("highlight-file", { detail: data }));
				break;

			case "refresh":
				this.dispatchEvent(new CustomEvent("refresh", { detail: data }));
				break;

			default:
				console.warn("Unknown WebSocket message type:", data.type);
		}
	}

	private scheduleReconnect() {
		this.clearReconnectInterval();

		console.log(`🔄 Scheduling reconnect in ${this.reconnectDelay}ms`);

		this.reconnectInterval = window.setTimeout(() => {
			console.log("🔄 Attempting to reconnect...");
			this.connect();

			// Exponential backoff
			this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
		}, this.reconnectDelay);
	}

	private clearReconnectInterval() {
		if (this.reconnectInterval) {
			clearTimeout(this.reconnectInterval);
			this.reconnectInterval = null;
		}
	}

	send(message: any): void {
		if (this.ws && this.connected) {
			this.ws.send(JSON.stringify(message));
		} else {
			console.warn("Cannot send message - WebSocket not connected");
		}
	}

	disconnect(): void {
		this.clearReconnectInterval();

		if (this.ws) {
			this.ws.close(1000, "Client disconnect");
			this.ws = null;
		}

		this.connected = false;
	}

	isConnected(): boolean {
		return this.connected;
	}
}
