// Presentation only: the server supplies focus and ranks. No game actions or timers advance a turn.
const wheels = new WeakMap();
const easing = 'cubic-bezier(.22,.75,.2,1)';

function number(root, key, fallback) {
    const value = Number(root.dataset[key]);
    return Number.isFinite(value) ? value : fallback;
}

function draw(state, animate, previousRanks = new Map()) {
    const { root, stage } = state;
    const width = stage.clientWidth;
    if (!width || !root.isConnected) return;
    const heroHeight = Number.parseFloat(getComputedStyle(root).getPropertyValue('--wheel-hero-height')) || 76;
    const scale = heroHeight / 100;
    const depth = number(root, 'depth', 1.3);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || document.visibilityState !== 'visible';
    const moving = animate && !reduced;
    const duration = number(root, 'duration', 1800);
    root.style.setProperty('--wheel-duration', `${duration}ms`);
    root.style.setProperty('--wheel-glow', number(root, 'glow', .35));
    root.style.setProperty('--wheel-tint', 1 - number(root, 'originalColors', 80) / 100);
    root.style.setProperty('--wheel-angle', `${state.rotation}deg`);

    // Compress the gaps compared with the chosen preview, including on wide desktop columns.
    const span = Math.min(width, Math.max(440, heroHeight * 4));
    const inset = (width - span) / 2;
    const positions = [
        { x: .20, bottom: heroHeight, scale: 1, yaw: 0, z: 8 },
        { x: .44, bottom: heroHeight - 12, scale: .68 / depth, yaw: -14, z: 0 },
        { x: .64, bottom: heroHeight - 24, scale: .43 / depth, yaw: -25, z: -12 }
    ];
    if (!moving) root.classList.remove('wheel-motion');
    for (const slot of root.querySelectorAll('.wheel-slot')) {
        const rank = Number(slot.dataset.rank);
        const id = slot.dataset.playerId;
        const visible = rank >= 0 && rank < positions.length;
        const exiting = moving && previousRanks.get(id) === 0 && !visible;
        const p = visible ? positions[rank] : {
            x: exiting ? -.22 : 1.15,
            bottom: heroHeight - 12,
            scale: exiting ? .65 : .23,
            yaw: exiting ? 25 : -38,
            z: -20
        };
        const x = inset + p.x * span;
        const figure = slot.querySelector('.wheel-figure');
        const label = slot.querySelector('.wheel-label');
        figure.style.left = '0';
        figure.style.top = '0';
        figure.style.transform = `translate3d(${x - 40}px,${p.bottom - 100}px,${p.z}px) scale(${scale * p.scale}) rotateY(${p.yaw}deg)`;
        figure.style.opacity = visible ? [1, .92, .84][rank] : 0;
        figure.style.zIndex = String(10 - Math.max(0, rank));
        const labelWidth = Math.min(102, span * .31);
        label.style.left = '0';
        label.style.top = '0';
        label.style.width = `${labelWidth}px`;
        label.style.transform = `translate(${x - labelWidth / 2}px,${p.bottom + 3}px)`;
        label.style.opacity = visible ? [1, .9, .8][rank] : 0;
        label.style.zIndex = String(20 - Math.max(0, rank));
    }
    root.dataset.wheelReady = 'true';
    // Flush immediate placement on first load / resize before enabling later turn transitions.
    if (!moving) {
        stage.getBoundingClientRect();
        root.classList.add('wheel-motion');
    }
}

export function update(root) {
    if (!root?.isConnected) return;
    let state = wheels.get(root);
    if (!state) {
        const stage = root.querySelector('.wheel-stage');
        if (!stage) return;
        state = { root, stage, focus: '', phase: '', rotation: 0, ranks: new Map(), timer: null, observer: null };
        state.observer = new ResizeObserver(() => {
            clearTimeout(state.timer);
            root.classList.remove('wheel-moving');
            draw(state, false);
        });
        state.observer.observe(stage);
        wheels.set(root, state);
    }
    const focus = root.dataset.focusPlayer || '';
    const phase = root.dataset.phase || '';
    const changedTurn = Boolean(state.focus && focus && focus !== state.focus && phase === state.phase);
    const previousRanks = state.ranks;
    state.focus = focus;
    state.phase = phase;
    state.ranks = new Map(Array.from(root.querySelectorAll('.wheel-slot'), s => [s.dataset.playerId, Number(s.dataset.rank)]));
    if (changedTurn) {
        clearTimeout(state.timer);
        state.rotation -= 90;
        root.classList.remove('wheel-moving');
        // Restart acquisition once per actual turn; duplicate SignalR refreshes do not replay it.
        root.getBoundingClientRect();
        root.classList.add('wheel-moving');
        draw(state, true, previousRanks);
        state.timer = setTimeout(() => {
            root.classList.remove('wheel-moving');
            draw(state, false);
        }, number(root, 'duration', 1800) + 30);
    } else if (!root.classList.contains('wheel-moving') || !focus) {
        clearTimeout(state.timer);
        if (!focus) root.classList.remove('wheel-moving');
        draw(state, false);
    }
}

export function disconnect(root) {
    const state = wheels.get(root);
    if (!state) return;
    clearTimeout(state.timer);
    state.observer.disconnect();
    wheels.delete(root);
}
