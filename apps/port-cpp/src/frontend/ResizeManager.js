/**
 * Manages resizable panels functionality
 * Handles the draggable divider between left and right panels
 */
class ResizeManager {
	constructor(onResize) {
		this.onResize = onResize; // Callback when panels are resized
		this.isResizing = false;
	}

	/**
	 * Set up the resizable panels functionality
	 */
	setupResizer() {
		const resizer = document.getElementById("resizer");
		const leftSection = document.querySelector(".left-section");
		const rightSection = document.querySelector(".right-section");
		const container = document.querySelector(".container");

		if (!resizer || !leftSection || !rightSection || !container) {
			console.warn("Resizer elements not found");
			return;
		}

		resizer.addEventListener("mousedown", (e) => {
			this.isResizing = true;
			document.body.style.cursor = "col-resize";
			document.body.style.userSelect = "none";
		});

		document.addEventListener("mousemove", (e) => {
			if (!this.isResizing) return;

			const containerRect = container.getBoundingClientRect();
			const containerWidth = containerRect.width;
			const mouseX = e.clientX - containerRect.left;

			let leftPercent = (mouseX / containerWidth) * 100;
			leftPercent = Math.max(20, Math.min(80, leftPercent));

			const rightPercent = 100 - leftPercent;

			leftSection.style.width = leftPercent + "%";
			rightSection.style.width = rightPercent + "%";

			// Trigger Monaco layout update after resize
			setTimeout(() => {
				this.onResize();
			}, 0);
		});

		document.addEventListener("mouseup", () => {
			if (this.isResizing) {
				this.isResizing = false;
				document.body.style.cursor = "";
				document.body.style.userSelect = "";
			}
		});
	}
}
