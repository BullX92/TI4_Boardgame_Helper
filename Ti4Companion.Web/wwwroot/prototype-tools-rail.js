const dialogs = new WeakMap();

export function open(dialog, callback, trigger) {
    if (!dialog?.isConnected) return;
    let state = dialogs.get(dialog);
    if (!state) {
        state = { callback, trigger, onClose: null };
        state.onClose = () => {
            if (state.trigger?.isConnected) state.trigger.focus({ preventScroll: true });
            state.callback.invokeMethodAsync('DialogClosed').catch(() => {});
        };
        dialog.addEventListener('close', state.onClose);
        dialogs.set(dialog, state);
    }
    state.callback = callback;
    state.trigger = trigger;
    // Safari does not focus mouse-clicked buttons, so explicitly remember/focus the return target.
    trigger?.focus({ preventScroll: true });
    // The native modal supplies background inertness and Escape dismissal.
    if (!dialog.open) dialog.showModal();
}

export function close(dialog) {
    if (dialog?.open) dialog.close();
}

export function focusOption(dialog) {
    const option = dialog?.querySelector('.tools-option[aria-pressed="true"]') || dialog?.querySelector('.tools-option');
    option?.focus();
}

export function disconnect(dialog) {
    const state = dialogs.get(dialog);
    if (!state) return;
    dialog.removeEventListener('close', state.onClose);
    if (dialog.open) dialog.close();
    dialogs.delete(dialog);
}
