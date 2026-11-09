let sentinel = null;
let callback = null;
let enabled = false;
let pending = null;
let generation = 0;

function supported() {
    return isSecureContext && typeof navigator.wakeLock?.request === 'function';
}

function report(value) {
    callback?.invokeMethodAsync('WakeChanged', value).catch(() => {});
}

// Each attempt belongs to one on/off and connection generation.
export async function request() {
    enabled = true;
    if (!callback || !supported() || pending || sentinel || document.visibilityState !== 'visible') return;
    const attempt = { generation };
    pending = attempt;
    try {
        const lock = await navigator.wakeLock.request('screen');
        if (generation !== attempt.generation || !enabled || !callback) {
            if (!lock.released) await lock.release();
            return;
        }
        sentinel = lock;
        lock.addEventListener('release', () => {
            if (sentinel !== lock) return;
            sentinel = null;
            report(false);
        });
        if (lock.released) {
            sentinel = null;
            report(false);
        } else {
            report(true);
        }
    } catch {
        if (generation === attempt.generation) report(false);
    } finally {
        if (pending === attempt) pending = null;
    }
}

function visible() {
    if (enabled && document.visibilityState === 'visible') void request();
}

export async function release() {
    enabled = false;
    generation++;
    pending = null;
    const lock = sentinel;
    // Keep reporting the actual lock state until release succeeds (or its event fires).
    if (lock && !lock.released) {
        try { await lock.release(); } catch { return; }
    }
    if (sentinel === lock) {
        sentinel = null;
        report(false);
    }
}

export async function connect(dotnet) {
    // Cleanup invalidates old attempts synchronously; its release may finish later.
    void disconnect();
    callback = dotnet;
    enabled = true;
    document.addEventListener('visibilitychange', visible);
    const capable = supported();
    if (capable) await request();
    return capable;
}

export function update(active) {
    document.title = active ? 'Your turn · TI4 Table Companion' : 'TI4 · Table Companion';
}

export async function disconnect() {
    enabled = false;
    generation++;
    pending = null;
    document.removeEventListener('visibilitychange', visible);
    callback = null;
    const lock = sentinel;
    sentinel = null;
    document.title = 'TI4 · Table Companion';
    if (lock && !lock.released) {
        try { await lock.release(); } catch { /* The browser may already have revoked it. */ }
    }
}
