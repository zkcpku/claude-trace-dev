# Spine Java Class Hierarchy

_Generated on 2025-06-12T10:08:48.771Z_

```

=== INTERFACES ===
AnimationStateListener (interface)
  ├── AnimationStateAdapter

AttachmentLoader (interface)
  ├── AtlasAttachmentLoader

BoneTimeline (interface)
  ├── BoneTimeline1
    ├── RotateTimeline
    ├── ScaleXTimeline
    ├── ScaleYTimeline
    ├── ShearXTimeline
    ├── ShearYTimeline
    ├── TranslateXTimeline
    ├── TranslateYTimeline
  ├── BoneTimeline2
    ├── ScaleTimeline
    ├── ShearTimeline
    ├── TranslateTimeline
  ├── InheritTimeline

ConstraintTimeline (interface)
  ├── ConstraintTimeline1
    ├── PathConstraintPositionTimeline
    ├── PathConstraintSpacingTimeline
    ├── PhysicsConstraintTimeline
      ├── PhysicsConstraintDampingTimeline
      ├── PhysicsConstraintGravityTimeline
      ├── PhysicsConstraintInertiaTimeline
      ├── PhysicsConstraintMassTimeline
      ├── PhysicsConstraintMixTimeline
      ├── PhysicsConstraintStrengthTimeline
      ├── PhysicsConstraintWindTimeline
    ├── SliderMixTimeline
    ├── SliderTimeline
  ├── IkConstraintTimeline
  ├── PathConstraintMixTimeline
  ├── PhysicsConstraintResetTimeline
  ├── TransformConstraintTimeline

HasTextureRegion (interface)
  ├── MeshAttachment
  ├── RegionAttachment

Pose (interface)
  ├── BoneLocal
    ├── BonePose
  ├── IkConstraintPose
  ├── PathConstraintPose
  ├── PhysicsConstraintPose
  ├── SliderPose
  ├── SlotPose
  ├── TransformConstraintPose

SlotTimeline (interface)
  ├── AlphaTimeline
  ├── AttachmentTimeline
  ├── SequenceTimeline
  ├── SlotCurveTimeline
    ├── DeformTimeline
    ├── RGB2Timeline
    ├── RGBA2Timeline
    ├── RGBATimeline
    ├── RGBTimeline

Update (interface)
  ├── BonePose
  ├── Constraint
    ├── IkConstraint
    ├── PathConstraint
    ├── PhysicsConstraint
    ├── Slider
    ├── TransformConstraint


=== ABSTRACT CLASSES ===
AnimationStateAdapter (abstract) implements AnimationStateListener
Attachment (abstract)
  ├── PointAttachment
  ├── RegionAttachment
  ├── SkeletonAttachment
  ├── VertexAttachment
    ├── BoundingBoxAttachment
    ├── ClippingAttachment
    ├── MeshAttachment
    ├── PathAttachment

BoneTimeline1 (abstract) extends CurveTimeline1 implements BoneTimeline
  ├── RotateTimeline
  ├── ScaleXTimeline
  ├── ScaleYTimeline
  ├── ShearXTimeline
  ├── ShearYTimeline
  ├── TranslateXTimeline
  ├── TranslateYTimeline

BoneTimeline2 (abstract) extends CurveTimeline implements BoneTimeline
  ├── ScaleTimeline
  ├── ShearTimeline
  ├── TranslateTimeline

Constraint (abstract) extends PosedActive implements Update
  ├── IkConstraint
  ├── PathConstraint
  ├── PhysicsConstraint
  ├── Slider
  ├── TransformConstraint

ConstraintData (abstract) extends PosedData
  ├── IkConstraintData
  ├── PathConstraintData
  ├── PhysicsConstraintData
  ├── SliderData
  ├── TransformConstraintData

ConstraintTimeline1 (abstract) extends CurveTimeline1 implements ConstraintTimeline
  ├── PathConstraintPositionTimeline
  ├── PathConstraintSpacingTimeline
  ├── PhysicsConstraintTimeline
    ├── PhysicsConstraintDampingTimeline
    ├── PhysicsConstraintGravityTimeline
    ├── PhysicsConstraintInertiaTimeline
    ├── PhysicsConstraintMassTimeline
    ├── PhysicsConstraintMixTimeline
    ├── PhysicsConstraintStrengthTimeline
    ├── PhysicsConstraintWindTimeline
  ├── SliderMixTimeline
  ├── SliderTimeline

CurveTimeline (abstract) extends Timeline
  ├── BoneTimeline2
    ├── ScaleTimeline
    ├── ShearTimeline
    ├── TranslateTimeline
  ├── CurveTimeline1
    ├── AlphaTimeline
    ├── BoneTimeline1
      ├── RotateTimeline
      ├── ScaleXTimeline
      ├── ScaleYTimeline
      ├── ShearXTimeline
      ├── ShearYTimeline
      ├── TranslateXTimeline
      ├── TranslateYTimeline
    ├── ConstraintTimeline1
      ├── PathConstraintPositionTimeline
      ├── PathConstraintSpacingTimeline
      ├── PhysicsConstraintTimeline
        ├── PhysicsConstraintDampingTimeline
        ├── PhysicsConstraintGravityTimeline
        ├── PhysicsConstraintInertiaTimeline
        ├── PhysicsConstraintMassTimeline
        ├── PhysicsConstraintMixTimeline
        ├── PhysicsConstraintStrengthTimeline
        ├── PhysicsConstraintWindTimeline
      ├── SliderMixTimeline
      ├── SliderTimeline
  ├── IkConstraintTimeline
  ├── PathConstraintMixTimeline
  ├── SlotCurveTimeline
    ├── DeformTimeline
    ├── RGB2Timeline
    ├── RGBA2Timeline
    ├── RGBATimeline
    ├── RGBTimeline
  ├── TransformConstraintTimeline

CurveTimeline1 (abstract) extends CurveTimeline
  ├── AlphaTimeline
  ├── BoneTimeline1
    ├── RotateTimeline
    ├── ScaleXTimeline
    ├── ScaleYTimeline
    ├── ShearXTimeline
    ├── ShearYTimeline
    ├── TranslateXTimeline
    ├── TranslateYTimeline
  ├── ConstraintTimeline1
    ├── PathConstraintPositionTimeline
    ├── PathConstraintSpacingTimeline
    ├── PhysicsConstraintTimeline
      ├── PhysicsConstraintDampingTimeline
      ├── PhysicsConstraintGravityTimeline
      ├── PhysicsConstraintInertiaTimeline
      ├── PhysicsConstraintMassTimeline
      ├── PhysicsConstraintMixTimeline
      ├── PhysicsConstraintStrengthTimeline
      ├── PhysicsConstraintWindTimeline
    ├── SliderMixTimeline
    ├── SliderTimeline

FromProperty (abstract)
  ├── FromRotate
  ├── FromScaleX
  ├── FromScaleY
  ├── FromShearY
  ├── FromX
  ├── FromY

PhysicsConstraintTimeline (abstract) extends ConstraintTimeline1
  ├── PhysicsConstraintDampingTimeline
  ├── PhysicsConstraintGravityTimeline
  ├── PhysicsConstraintInertiaTimeline
  ├── PhysicsConstraintMassTimeline
  ├── PhysicsConstraintMixTimeline
  ├── PhysicsConstraintStrengthTimeline
  ├── PhysicsConstraintWindTimeline

Posed (abstract) extends P>
  ├── PosedActive
    ├── Bone
    ├── Constraint
      ├── IkConstraint
      ├── PathConstraint
      ├── PhysicsConstraint
      ├── Slider
      ├── TransformConstraint
  ├── Slot

PosedActive (abstract) extends Posed
  ├── Bone
  ├── Constraint
    ├── IkConstraint
    ├── PathConstraint
    ├── PhysicsConstraint
    ├── Slider
    ├── TransformConstraint

PosedData (abstract) extends Pose>
  ├── BoneData
  ├── ConstraintData
    ├── IkConstraintData
    ├── PathConstraintData
    ├── PhysicsConstraintData
    ├── SliderData
    ├── TransformConstraintData
  ├── SlotData

SkeletonLoader (abstract)
  ├── SkeletonBinary
  ├── SkeletonJson

SlotCurveTimeline (abstract) extends CurveTimeline implements SlotTimeline
  ├── DeformTimeline
  ├── RGB2Timeline
  ├── RGBA2Timeline
  ├── RGBATimeline
  ├── RGBTimeline

Timeline (abstract)
  ├── AttachmentTimeline
  ├── CurveTimeline
    ├── BoneTimeline2
      ├── ScaleTimeline
      ├── ShearTimeline
      ├── TranslateTimeline
    ├── CurveTimeline1
      ├── AlphaTimeline
      ├── BoneTimeline1
        ├── RotateTimeline
        ├── ScaleXTimeline
        ├── ScaleYTimeline
        ├── ShearXTimeline
        ├── ShearYTimeline
        ├── TranslateXTimeline
        ├── TranslateYTimeline
      ├── ConstraintTimeline1
        ├── PathConstraintPositionTimeline
        ├── PathConstraintSpacingTimeline
        ├── PhysicsConstraintTimeline
          ├── PhysicsConstraintDampingTimeline
          ├── PhysicsConstraintGravityTimeline
          ├── PhysicsConstraintInertiaTimeline
          ├── PhysicsConstraintMassTimeline
          ├── PhysicsConstraintMixTimeline
          ├── PhysicsConstraintStrengthTimeline
          ├── PhysicsConstraintWindTimeline
        ├── SliderMixTimeline
        ├── SliderTimeline
    ├── IkConstraintTimeline
    ├── PathConstraintMixTimeline
    ├── SlotCurveTimeline
      ├── DeformTimeline
      ├── RGB2Timeline
      ├── RGBA2Timeline
      ├── RGBATimeline
      ├── RGBTimeline
    ├── TransformConstraintTimeline
  ├── DrawOrderTimeline
  ├── EventTimeline
  ├── InheritTimeline
  ├── PhysicsConstraintResetTimeline
  ├── SequenceTimeline

ToProperty (abstract)
  ├── ToRotate
  ├── ToScaleX
  ├── ToScaleY
  ├── ToShearY
  ├── ToX
  ├── ToY

VertexAttachment (abstract) extends Attachment
  ├── BoundingBoxAttachment
  ├── ClippingAttachment
  ├── MeshAttachment
  ├── PathAttachment


=== CONCRETE CLASSES ===
AlphaTimeline extends CurveTimeline1 implements SlotTimeline
Animation
AnimationState
AnimationStateData
AtlasAttachmentLoader implements AttachmentLoader
AttachmentTimeline extends Timeline implements SlotTimeline
AttachmentType extends Enum
BlendMode extends Enum
Bone extends PosedActive
BoneData extends PosedData
BoneLocal implements Pose
BonePose extends BoneLocal implements Update
BoundingBoxAttachment extends VertexAttachment
ClippingAttachment extends VertexAttachment
DeformTimeline extends SlotCurveTimeline
DrawOrderTimeline extends Timeline
Event
EventData
EventQueue
EventTimeline extends Timeline
EventType extends Enum
FromRotate extends FromProperty
FromScaleX extends FromProperty
FromScaleY extends FromProperty
FromShearY extends FromProperty
FromX extends FromProperty
FromY extends FromProperty
IkConstraint extends Constraint
IkConstraintData extends ConstraintData
IkConstraintPose implements Pose
IkConstraintTimeline extends CurveTimeline implements ConstraintTimeline
Inherit extends Enum
InheritTimeline extends Timeline implements BoneTimeline
Key
LinkedMesh
LinkedMesh
MeshAttachment extends VertexAttachment implements HasTextureRegion
MixBlend extends Enum
MixDirection extends Enum
PathAttachment extends VertexAttachment
PathConstraint extends Constraint
PathConstraintData extends ConstraintData
PathConstraintMixTimeline extends CurveTimeline implements ConstraintTimeline
PathConstraintPose implements Pose
PathConstraintPositionTimeline extends ConstraintTimeline1
PathConstraintSpacingTimeline extends ConstraintTimeline1
Physics extends Enum
PhysicsConstraint extends Constraint
PhysicsConstraintDampingTimeline extends PhysicsConstraintTimeline
PhysicsConstraintData extends ConstraintData
PhysicsConstraintGravityTimeline extends PhysicsConstraintTimeline
PhysicsConstraintInertiaTimeline extends PhysicsConstraintTimeline
PhysicsConstraintMassTimeline extends PhysicsConstraintTimeline
PhysicsConstraintMixTimeline extends PhysicsConstraintTimeline
PhysicsConstraintPose implements Pose
PhysicsConstraintResetTimeline extends Timeline implements ConstraintTimeline
PhysicsConstraintStrengthTimeline extends PhysicsConstraintTimeline
PhysicsConstraintWindTimeline extends PhysicsConstraintTimeline
PointAttachment extends Attachment
PositionMode extends Enum
Property extends Enum
RegionAttachment extends Attachment implements HasTextureRegion
RGB2Timeline extends SlotCurveTimeline
RGBA2Timeline extends SlotCurveTimeline
RGBATimeline extends SlotCurveTimeline
RGBTimeline extends SlotCurveTimeline
RotateMode extends Enum
RotateTimeline extends BoneTimeline1
ScaleTimeline extends BoneTimeline2
ScaleXTimeline extends BoneTimeline1
ScaleYTimeline extends BoneTimeline1
Sequence
SequenceMode extends Enum
SequenceTimeline extends Timeline implements SlotTimeline
ShearTimeline extends BoneTimeline2
ShearXTimeline extends BoneTimeline1
ShearYTimeline extends BoneTimeline1
Skeleton
SkeletonActor extends Actor
SkeletonActorPool extends Pool
SkeletonAttachment extends Attachment
SkeletonBinary extends SkeletonLoader
SkeletonBounds
SkeletonClipping
SkeletonData
SkeletonDataLoader extends AsynchronousAssetLoader
SkeletonDataParameter extends AssetLoaderParameters
SkeletonDrawable extends BaseDrawable
SkeletonInput extends DataInput
SkeletonJson extends SkeletonLoader
SkeletonPool extends Pool
SkeletonRenderer
SkeletonRendererDebug
Skin
SkinEntry
Slider extends Constraint
SliderData extends ConstraintData
SliderMixTimeline extends ConstraintTimeline1
SliderPose implements Pose
SliderTimeline extends ConstraintTimeline1
Slot extends Posed
SlotData extends PosedData
SlotPose implements Pose
SpacingMode extends Enum
SpineUtils
ToRotate extends ToProperty
ToScaleX extends ToProperty
ToScaleY extends ToProperty
ToShearY extends ToProperty
ToX extends ToProperty
ToY extends ToProperty
TrackEntry implements Poolable
TransformConstraint extends Constraint
TransformConstraintData extends ConstraintData
TransformConstraintPose implements Pose
TransformConstraintTimeline extends CurveTimeline implements ConstraintTimeline
TranslateTimeline extends BoneTimeline2
TranslateXTimeline extends BoneTimeline1
TranslateYTimeline extends BoneTimeline1
Triangulator
TwoColorPolygonBatch implements PolygonBatch
Vertices
```
