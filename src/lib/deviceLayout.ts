import type { DeviceInfo, DeviceLayout, DeviceLayoutControl, DeviceLayoutSurface } from "$lib/DeviceInfo";

type NormalizedControlKind = "key" | "touchpoint" | "encoder";

export const INFERRED_DEVICE_LAYOUT_VERSION = 1;
export const EXPLICIT_DEVICE_LAYOUT_VERSION = 2;
export const LEGACY_LAYOUT_CELL_SIZE_PX = 132;
export const LEGACY_LAYOUT_CONTROL_SIZE_PX = 112;

export type NormalizedControl = {
	controller: string;
	position: number;
	kind: NormalizedControlKind;
	shape: string;
	x: number;
	y: number;
	width: number;
	height: number;
	centerX: number;
	centerY: number;
	radius?: number;
	surface?: string;
	label: string;
	isTouchpoint: boolean;
};

export type NormalizedSurface = DeviceLayoutSurface;

export type NormalizedDeviceLayout = {
	canvas: {
		width: number;
		height: number;
		unit: string;
	};
	surfaces: NormalizedSurface[];
	controls: NormalizedControl[];
};

function normalizeControlKind(device: DeviceInfo, control: DeviceLayoutControl): NormalizedControlKind {
	if (control.controller.toLowerCase() === "encoder") return "encoder";

	const declaredKind = control.kind?.toLowerCase();
	if (declaredKind === "encoder" || declaredKind === "touchpoint" || declaredKind === "key") {
		return declaredKind;
	}

	if (!device.layout || (device.layoutVersion ?? INFERRED_DEVICE_LAYOUT_VERSION) < EXPLICIT_DEVICE_LAYOUT_VERSION) {
		const keyCount = device.rows * device.columns;
		const isLegacyTouchpoint = control.position >= keyCount && control.position < (keyCount + device.touchpoints);
		return isLegacyTouchpoint ? "touchpoint" : "key";
	}

	return "key";
}

function normalizeControl(device: DeviceInfo, control: DeviceLayoutControl): NormalizedControl {
	const kind = normalizeControlKind(device, control);
	const width = control.width ?? (control.radius ? control.radius * 2 : LEGACY_LAYOUT_CELL_SIZE_PX);
	const height = control.height ?? (control.radius ? control.radius * 2 : LEGACY_LAYOUT_CELL_SIZE_PX);
	const x = control.x ?? ((control.centerX ?? 0) - (width / 2));
	const y = control.y ?? ((control.centerY ?? 0) - (height / 2));
	const centerX = control.centerX ?? (x + (width / 2));
	const centerY = control.centerY ?? (y + (height / 2));
	const isTouchpoint = kind === "touchpoint";

	return {
		controller: control.controller,
		position: control.position,
		kind,
		shape: control.shape,
		x,
		y,
		width,
		height,
		centerX,
		centerY,
		radius: control.radius,
		surface: control.surface,
		label: `${control.controller} ${control.position + 1}`,
		isTouchpoint,
	};
}

function relabelControls(controls: NormalizedControl[]) {
	let keyCount = 0;
	let touchpointCount = 0;
	let encoderCount = 0;

	return controls.map((control) => {
		if (control.kind === "encoder") {
			encoderCount++;
			return { ...control, label: `Encoder ${encoderCount}` };
		}

		if (control.kind === "touchpoint") {
			touchpointCount++;
			return { ...control, label: `Touch point ${touchpointCount}` };
		}

		keyCount++;
		return { ...control, label: `Key ${keyCount}` };
	});
}

function createLegacyLayout(device: DeviceInfo): DeviceLayout {
	const cell = LEGACY_LAYOUT_CELL_SIZE_PX;
	const controlSize = LEGACY_LAYOUT_CONTROL_SIZE_PX;
	const inset = Math.floor((cell - controlSize) / 2);
	const rows = device.rows + Math.min(device.encoders, 1) + Math.min(device.touchpoints, 1);
	const columns = Math.max(device.columns, device.encoders, device.touchpoints, 1);
	const controls: DeviceLayoutControl[] = [];
	const surfaces: DeviceLayoutSurface[] = [];

	for (let row = 0; row < device.rows; row++) {
		for (let column = 0; column < device.columns; column++) {
			controls.push({
				controller: "Keypad",
				position: (row * device.columns) + column,
				kind: "key",
				shape: "rect",
				x: (column * cell) + inset,
				y: (row * cell) + inset,
				width: controlSize,
				height: controlSize,
			});
		}
	}

	for (let index = 0; index < device.encoders; index++) {
		controls.push({
			controller: "Encoder",
			position: index,
			kind: "encoder",
			shape: "circle",
			centerX: (index * cell) + (cell / 2),
			centerY: (device.rows * cell) + (cell / 2),
			radius: Math.floor(controlSize / 2),
		});
	}

	if (device.touchpoints > 0) {
		surfaces.push({
			id: "legacy-touchpoints",
			kind: "touchpoints",
			x: 0,
			y: (device.rows + Math.min(device.encoders, 1)) * cell,
			width: device.touchpoints * cell,
			height: cell,
		});
	}

	for (let index = 0; index < device.touchpoints; index++) {
		controls.push({
			controller: "Keypad",
			position: (device.rows * device.columns) + index,
			kind: "touchpoint",
			shape: "rect",
			x: (index * cell) + inset,
			y: ((device.rows + Math.min(device.encoders, 1)) * cell) + inset,
			width: controlSize,
			height: controlSize,
		});
	}

	return {
		canvas: {
			width: columns * cell,
			height: Math.max(rows, 1) * cell,
			unit: "px",
		},
		surfaces,
		controls,
	};
}

export function normalizeDeviceLayout(device: DeviceInfo): NormalizedDeviceLayout {
	const layout = device.layout ?? createLegacyLayout(device);
	const controls = relabelControls([...layout.controls]
		.map((control) => normalizeControl(device, control))
		.sort((left, right) => (left.y - right.y) || (left.x - right.x) || (left.controller.localeCompare(right.controller)) || (left.position - right.position)));

	return {
		canvas: {
			width: layout.canvas.width,
			height: layout.canvas.height,
			unit: layout.canvas.unit,
		},
		surfaces: layout.surfaces,
		controls,
	};
}

export function getDeviceCanvasSize(device: DeviceInfo) {
	const layout = normalizeDeviceLayout(device);
	return {
		width: layout.canvas.width,
		height: layout.canvas.height,
	};
}
