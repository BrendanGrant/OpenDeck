import type { DeviceDescriptor } from "$lib/DeviceInfo";
import { SUPPORTED_DEVICE_LAYOUT_VERSION } from "$lib/DeviceInfo";

const LEGACY_LAYOUT_CELL_SIZE_PX = 132;

export function getDeviceCanvasSize(device: DeviceDescriptor) {
	if (device.layoutVersion == SUPPORTED_DEVICE_LAYOUT_VERSION && device.layout) {
		return {
			width: device.layout.canvas.width,
			height: device.layout.canvas.height,
		};
	}

	// Large legacy devices scroll inside the window rather than growing it without limit.
	const columns = Math.min(Math.max(device.columns, device.encoders, device.touchpoints, 1), 8);
	const rows = Math.min(device.rows + Math.min(device.encoders, 1) + Math.min(device.touchpoints, 1), 4);
	return {
		width: columns * LEGACY_LAYOUT_CELL_SIZE_PX,
		height: Math.max(rows, 1) * LEGACY_LAYOUT_CELL_SIZE_PX,
	};
}
