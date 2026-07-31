import { Panel } from '../ui/Panel'
export function CameraPlaceholder() {
  return (
    <Panel className="camera-placeholder">
      <span className="camera-source">VIDEO INPUT</span>
      <div>
        <p className="eyebrow">CAMERA</p>
        <h2>No video source connected</h2>
        <p>
          Video, mission, safety, depth, and detection overlays will be available when a video source is
          configured.
        </p>
      </div>
    </Panel>
  )
}
