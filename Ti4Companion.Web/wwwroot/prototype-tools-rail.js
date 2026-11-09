const dialogs = new WeakMap();

function syncFullscreen(state) {
    const active = !!document.fullscreenElement;
    const available = active
        ? typeof document.exitFullscreen === 'function'
        : !!document.fullscreenEnabled && typeof document.documentElement?.requestFullscreen === 'function';
    state.fullscreenButton.disabled = state.busy || !available;
    state.fullscreenButton.setAttribute('aria-pressed', String(active));
    state.fullscreenButton.querySelector('[data-fullscreen-label]').textContent = active ? 'Vollbild verlassen' : 'Vollbild';
    state.fullscreenButton.title = available ? '' : 'Vollbild wird hier nicht unterstützt oder ist vom Browser gesperrt.';
}

function connectFullscreen(dialog, state) {
    state.fullscreenButton = dialog.querySelector('.tools-fullscreen');
    state.fullscreenStatus = dialog.querySelector('.tools-fullscreen-status');
    if (!state.fullscreenButton) return;
    state.busy = false;
    state.onFullscreenChange = () => syncFullscreen(state);
    state.onFullscreen = async () => {
        if (state.busy || state.fullscreenButton.disabled || dialogs.get(dialog) !== state) return;
        state.busy = true;
        state.fullscreenStatus.hidden = true;
        syncFullscreen(state);
        try {
            // The browser call must precede the first await: preserve the actual tap's activation.
            if (document.fullscreenElement) await document.exitFullscreen();
            else await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
            // Close the native modal after success, so failures remain visible and retryable.
            if (dialogs.get(dialog) === state) close(dialog);
        } catch {
            if (dialogs.get(dialog) === state) {
                state.fullscreenStatus.textContent = 'Vollbild konnte nicht umgeschaltet werden. Bitte erneut antippen.';
                state.fullscreenStatus.hidden = false;
            }
        } finally {
            if (dialogs.get(dialog) === state) { state.busy = false; syncFullscreen(state); }
        }
    };
    state.fullscreenButton.addEventListener('click', state.onFullscreen);
    document.addEventListener('fullscreenchange', state.onFullscreenChange);
}

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
        connectFullscreen(dialog, state);
    }
    state.callback = callback;
    state.trigger = trigger;
    if (state.fullscreenButton) syncFullscreen(state);
    // Safari does not focus mouse-clicked buttons, so explicitly remember/focus the return target.
    trigger?.focus({ preventScroll: true });
    // The native modal supplies background inertness and Escape dismissal.
    if (!dialog.open) dialog.showModal();
}

export function close(dialog) {
    if (dialog?.open) dialog.close();
}

export function focusOption(dialog) {
    const option = dialog?.querySelector('.tools-option.selected') || dialog?.querySelector('.tools-option');
    option?.focus();
}

export function disconnect(dialog) {
    const state = dialogs.get(dialog);
    if (!state) return;
    document.removeEventListener('fullscreenchange', state.onFullscreenChange);
    state.fullscreenButton?.removeEventListener('click', state.onFullscreen);
    dialog.removeEventListener('close', state.onClose);
    if (dialog.open) dialog.close();
    dialogs.delete(dialog);
}
