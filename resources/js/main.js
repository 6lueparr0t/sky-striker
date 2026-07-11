// Neutralino bootstrap for Sky Striker.
// Initializes the native layer and wires the window-close handler.

Neutralino.init();

Neutralino.events.on("windowClose", () => {
    Neutralino.app.exit();
});
