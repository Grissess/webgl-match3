export let ALL_ANIMATIONS = new Set();

export class Animate {
	constructor(func, duration) {
		this.func = func;
		this.start = Date.now();
		this.duration = duration;
		this.thens = [];
		ALL_ANIMATIONS.add(this);
	}

	update() {
		const dt = Date.now() - this.start;
		const nu = Math.min(dt / this.duration, 1.0);
		this.func(nu, dt, this);
		if(dt >= this.duration) return true;
		return false;
	}

	then(f, e) {
		this.thens.push(f);
	}

	done() {
		this.thens.forEach(f => f());
		this.thens.length = 0;
	}

	static tick() {
		ALL_ANIMATIONS.forEach(anim => {
			if(anim.update()) {
				setTimeout(anim.done.bind(anim), 0);
				ALL_ANIMATIONS.delete(anim);
			}
		});
	}
}

export class OnFrame extends Animate {
	constructor(func) {
		super(func, Infinity);
	}
}

function tick_all_animations() {
	window.requestAnimationFrame(tick_all_animations);
	Animate.tick();
}
tick_all_animations();
