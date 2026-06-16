export type DeviceLayoutCanvas = {
	width: number;
	height: number;
	unit: string;
};

export type DeviceLayoutSurface = {
	id: string;
	kind: string;
	x: number;
	y: number;
	width: number;
	height: number;
	pixelWidth?: number;
	pixelHeight?: number;
};

export type DeviceLayoutControl = {
	controller: string;
	position: number;
	kind?: string;
	shape: string;
	x?: number;
	y?: number;
	width?: number;
	height?: number;
	centerX?: number;
	centerY?: number;
	radius?: number;
	surface?: string;
};

export type DeviceLayout = {
	canvas: DeviceLayoutCanvas;
	surfaces: DeviceLayoutSurface[];
	controls: DeviceLayoutControl[];
};

export type DeviceInfo = {
	id: string;
	name: string;
	rows: number;
	columns: number;
	encoders: number;
	touchpoints: number;
	type: number;
	layoutVersion?: number;
	layout?: DeviceLayout;
};
