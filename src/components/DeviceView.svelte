<script lang="ts">
	import type { ActionInstance } from "$lib/ActionInstance";
	import type { Context } from "$lib/Context";
	import type { DeviceInfo } from "$lib/DeviceInfo";
	import type { Profile } from "$lib/Profile";
	import type { CopiedItem } from "$lib/propertyInspector";
	import {
		LEGACY_LAYOUT_CELL_SIZE_PX,
		normalizeDeviceLayout,
		type NormalizedControl,
	} from "$lib/deviceLayout";

	import Key from "./Key.svelte";

	import { inspectedInstance, inspectedParentAction } from "$lib/propertyInspector";

	import { invoke } from "@tauri-apps/api/core";

	export let device: DeviceInfo;
	export let profile: Profile;

	export let selectedDevice: string;

	function handleDragStart({ dataTransfer }: DragEvent, controller: string, position: number) {
		if (!dataTransfer) return;
		dataTransfer.effectAllowed = "move";
		dataTransfer.setData("controller", controller);
		dataTransfer.setData("position", position.toString());
	}

	function handleDragOver(event: DragEvent) {
		event.preventDefault();
		if (!event.dataTransfer) return;
		if (event.dataTransfer.types.includes("action")) event.dataTransfer.dropEffect = "copy";
		else if (event.dataTransfer.types.includes("controller")) event.dataTransfer.dropEffect = "move";
	}

	async function handleDrop({ dataTransfer }: DragEvent, controller: string, position: number) {
		let context = { device: device.id, profile: profile.id, controller, position };
		let array = controller == "Encoder" ? profile.sliders : profile.keys;
		if (dataTransfer?.getData("action")) {
			let action = JSON.parse(dataTransfer?.getData("action"));
			if (array[position]) {
				return;
			}
			array[position] = await invoke("create_instance", { context, action });
			profile = profile;
		} else if (dataTransfer?.getData("controller")) {
			let oldArray = dataTransfer?.getData("controller") == "Encoder" ? profile.sliders : profile.keys;
			let oldPosition = parseInt(dataTransfer?.getData("position"));
			let response: ActionInstance = await invoke("move_instance", {
				source: { device: device.id, profile: profile.id, controller: dataTransfer?.getData("controller"), position: oldPosition },
				destination: context,
				retain: false,
			});
			if (response) {
				array[position] = response;
				oldArray[oldPosition] = null;
				profile = profile;
			}
		}
	}

	async function handlePaste(item: CopiedItem, destination: Context) {
		let array = destination.controller == "Encoder" ? profile.sliders : profile.keys;

		if (item.type == "action") {
			if (array[destination.position]) return;
			array[destination.position] = await invoke("create_instance", { context: destination, action: item.action });
			profile = profile;
			return;
		}

		let response: ActionInstance = await invoke("move_instance", { source: item.source, destination, retain: true });
		if (response) {
			array[destination.position] = response;
			profile = profile;
		}
	}

	$: layout = normalizeDeviceLayout(device);
	$: controls = layout.controls;
	$: renderedControls = controls.map((control) => ({
		...control,
		slot: control.controller === "Encoder" ? profile.sliders[control.position] : profile.keys[control.position],
	}));
	$: overflowsX = layout.canvas.width > (8 * LEGACY_LAYOUT_CELL_SIZE_PX);
	$: overflowsY = layout.canvas.height > (4 * LEGACY_LAYOUT_CELL_SIZE_PX);

	let focusedIndex = 0;

	function rangesOverlap(startA: number, endA: number, startB: number, endB: number) {
		return startA < endB && startB < endA;
	}

	function getNextDirectionalIndex(direction: "left" | "right" | "up" | "down") {
		const current = controls[focusedIndex];
		if (!current) return focusedIndex;

		const currentLeft = current.x;
		const currentRight = current.x + current.width;
		const currentTop = current.y;
		const currentBottom = current.y + current.height;

		const candidates = controls
			.map((control, index) => ({ control, index }))
			.filter(({ index }) => index !== focusedIndex)
			.map(({ control, index }) => {
				const left = control.x;
				const right = control.x + control.width;
				const top = control.y;
				const bottom = control.y + control.height;
				const dx = control.centerX - current.centerX;
				const dy = control.centerY - current.centerY;

				let primaryDistance = 0;
				let secondaryDistance = 0;
				let aligned = false;
				let inDirection = false;

				switch (direction) {
					case "left":
						inDirection = control.centerX < current.centerX;
						primaryDistance = current.centerX - control.centerX;
						secondaryDistance = Math.abs(dy);
						aligned = rangesOverlap(currentTop, currentBottom, top, bottom);
						break;
					case "right":
						inDirection = control.centerX > current.centerX;
						primaryDistance = control.centerX - current.centerX;
						secondaryDistance = Math.abs(dy);
						aligned = rangesOverlap(currentTop, currentBottom, top, bottom);
						break;
					case "up":
						inDirection = control.centerY < current.centerY;
						primaryDistance = current.centerY - control.centerY;
						secondaryDistance = Math.abs(dx);
						aligned = rangesOverlap(currentLeft, currentRight, left, right);
						break;
					case "down":
						inDirection = control.centerY > current.centerY;
						primaryDistance = control.centerY - current.centerY;
						secondaryDistance = Math.abs(dx);
						aligned = rangesOverlap(currentLeft, currentRight, left, right);
						break;
				}

				return {
					index,
					inDirection,
					aligned,
					primaryDistance,
					secondaryDistance,
					distanceSquared: (dx * dx) + (dy * dy),
				};
			})
			.filter((candidate) => candidate.inDirection)
			.sort((left, right) =>
				Number(right.aligned) - Number(left.aligned) ||
				left.primaryDistance - right.primaryDistance ||
				left.secondaryDistance - right.secondaryDistance ||
				left.distanceSquared - right.distanceSquared
			);

		return candidates[0]?.index ?? focusedIndex;
	}

	function handleGridKeydown(event: KeyboardEvent) {
		const target = event.target as HTMLElement;
		if (target.getAttribute("role") !== "gridcell") return;
		if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;

		event.preventDefault();
		event.stopPropagation();

		let nextIndex = focusedIndex;

		switch (event.key) {
			case "ArrowLeft":
				nextIndex = getNextDirectionalIndex("left");
				break;
			case "ArrowUp":
				nextIndex = getNextDirectionalIndex("up");
				break;
			case "ArrowRight":
				nextIndex = getNextDirectionalIndex("right");
				break;
			case "ArrowDown":
				nextIndex = getNextDirectionalIndex("down");
				break;
			case "Home":
				nextIndex = 0;
				break;
			case "End":
				nextIndex = Math.max(controls.length - 1, 0);
				break;
		}

		if (nextIndex === focusedIndex) return;

		focusedIndex = nextIndex;
		const grid = event.currentTarget as HTMLElement;
		const cells = grid.querySelectorAll("[role='gridcell']");
		(cells[nextIndex] as HTMLElement)?.focus();
	}

	function handleGridFocusin(event: FocusEvent) {
		const grid = event.currentTarget as HTMLElement;
		const cells = Array.from(grid.querySelectorAll("[role='gridcell']"));
		const index = cells.indexOf(event.target as Element);
		if (index !== -1) focusedIndex = index;
	}
</script>

<style>
	.device-fade-x {
		mask-image: linear-gradient(to right, transparent, black 7.5rem, black calc(100% - 7.5rem), transparent);
	}
	.device-fade-y {
		mask-image: linear-gradient(to bottom, transparent, black 7.5rem, black calc(100% - 7.5rem), transparent);
	}
	.device-fade-xy {
		mask-image:
			linear-gradient(to right, transparent, black 7.5rem, black calc(100% - 7.5rem), transparent),
			linear-gradient(to bottom, transparent, black 7.5rem, black calc(100% - 7.5rem), transparent);
		mask-composite: intersect;
	}
</style>

{#key device}
	<span id="grid-description" class="sr-only">Use arrow keys to move between controls. Moving to a control will display its property inspector.</span>
	<div
		class="flex grow justify-center px-16 py-6 overflow-auto"
		class:items-center={!overflowsX}
		class:hidden={$inspectedParentAction || selectedDevice != device.id}
		class:device-fade-x={overflowsX && !overflowsY}
		class:device-fade-y={overflowsY && !overflowsX}
		class:device-fade-xy={overflowsX && overflowsY}
		role="grid"
		aria-label={device.name}
		aria-describedby="grid-description"
		tabindex="-1"
		on:click={() => inspectedInstance.set(null)}
		on:keyup={() => inspectedInstance.set(null)}
		on:keydown|capture={handleGridKeydown}
		on:focusin={handleGridFocusin}
	>
		<div
			class="relative shrink-0"
			style={`width: ${layout.canvas.width}px; height: ${layout.canvas.height}px;`}
		>
			{#each layout.surfaces.filter((surface) => !["keypad", "display"].includes(surface.kind)) as surface}
				<div
					class="absolute box-border rounded-3xl border border-neutral-700/80 pointer-events-none"
					style={`left: ${surface.x}px; top: ${surface.y}px; width: ${surface.width}px; height: ${surface.height}px;`}
				></div>
			{/each}

			{#each renderedControls as control, index}
				<div
					class="absolute"
					style={`left: ${control.x}px; top: ${control.y}px; width: ${control.width}px; height: ${control.height}px;`}
				>
					<Key
						context={{ device: device.id, profile: profile.id, controller: control.controller, position: control.position }}
						inslot={control.slot}
						on:dragover={handleDragOver}
						on:drop={(event) => handleDrop(event, control.controller, control.position)}
						on:dragstart={(event) => handleDragStart(event, control.controller, control.position)}
						{handlePaste}
						width={control.width}
						height={control.height}
						shape={control.shape === "circle" ? "circle" : "rect"}
						isTouchPoint={control.isTouchpoint}
						label={control.label}
						tabindex={focusedIndex === index ? 0 : -1}
					/>
				</div>
			{/each}
		</div>
	</div>
{/key}
