import * as board from './board.js';
import * as render from './render.js';
import * as gl from './gl.js';
import * as anim from './anim.js';

const COINS = [1, 2, 3, 4].map(n =>
	n == 1 ? 'img/coin.png' : `img/coin${n}.png`
);
const COIN_PERIOD = 500;
const COIN_IDX = 1;

const TEES = ['', '2', '3', '2'].map(s => `img/t${s}.png`);
const TEE_IDX = 3;

const DEFAULT_DIMS = [12, 12];
const DEFAULT_TILES = [
	{idx: 0, url: 'img/gem.png'},
	{idx: 1, url: COINS[0]},
	{idx: 2, url: 'img/cherries.png'},
	{idx: 3},
	{idx: 4},
	{idx: 5},
	{idx: 6},
];

const LETTER_TILES = [
	{idx: 0, url: 'img/n.png'},
	{idx: 1, url: 'img/o.png'},
	{idx: 2, url: 'img/r.png'},
	{idx: 3, url: 'img/t.png'},
	{idx: 4, url: 'img/h.png'},
	{idx: 5, url: 'img/u.png'},
	{idx: 6, url: 'img/g.png'},
];

const DRAGON_TILES = [0, 1, 2, 3, 4, 5, 6].map(i =>
	({idx: i, url: `img/dragon${i + 1}.png`})
);

const FACULTY_TILES = [
	{idx: 0, url: 'img/tamon.jpg'},
	{idx: 1, url: 'img/matthews.gif'},
	{idx: 2, url: 'img/maciel17.jpg'},
	{idx: 3, url: 'img/lynch.jpg'},
	{idx: 4, url: 'img/hunter.jpg'},
	{idx: 5, url: 'img/collins.jpg'},
	{idx: 6, url: 'img/casper.jpg'},
];

const ALL_TILE_SETS = [
	DEFAULT_TILES,
	LETTER_TILES,
	DRAGON_TILES,
	FACULTY_TILES,
];

export class Game {
	constructor(canvas, brd) {
		if(brd == undefined) {
			const [w, h] = DEFAULT_DIMS;
			brd = new board.Board(w, h, DEFAULT_TILES);
		}

		this.canvas = canvas;
		this.ctx = new gl.GLContext(canvas);
		this.ctx.enable("BLEND");
		this.ctx.gl.blendFunc(
			this.ctx.gl.SRC_ALPHA,
			this.ctx.gl.ONE_MINUS_SRC_ALPHA,
		);
		this.board = brd;
		this.renderer = new render.BoardRenderer(this.ctx, brd);
		this.coin_anim = new anim.OnFrame((u, t) => {
			const ut = Date.now() % COIN_PERIOD / COIN_PERIOD;
			const coin = COINS[Math.floor(ut * COINS.length)];
			let updated = false;
			if(DEFAULT_TILES[COIN_IDX].url != coin) {
				DEFAULT_TILES[COIN_IDX].url = coin;
				updated = true;
			}
			const tee = TEES[Math.floor(ut * TEES.length)];
			if(LETTER_TILES[TEE_IDX].url != tee) {
				LETTER_TILES[TEE_IDX].url = tee;
				updated = true;
			}
			if(updated) {
				this.renderer.render_tile_textures();
			}
		});

		this.shift_count = 0;
		this.tile_idx = 0;
		this.breathing = true;

		this.do_mark_passes();
		this._score = 0;
		this.onscoreupdate = () => undefined;
	}

	get score() {
		return this._score;
	}

	set score(v) {
		this._score = v;
		this.onscoreupdate(v, this);
	}

	mouse_to_board(ev) {
		const cr = this.canvas.getBoundingClientRect();
		const x = ev.clientX - cr.left, y = ev.clientY - cr.top;
		const nx = x / cr.width, ny = y / cr.height;
		const col = Math.floor(nx * this.board.width);
		const row = Math.floor((1 - ny) * this.board.height);
		if(row < 0 || row >= this.board.height || col < 0 || col >= this.board.width) return null;
		return [row, col];
	}

	async handle_move(ev) {
		const bc = this.mouse_to_board(ev);
		this.renderer.hover_pos = bc;
		this.renderer.update();
	}

	async handle_click(ev) {
		const bc = this.mouse_to_board(ev);
		if(this.renderer.selected_pos) {
			const [sr, sc] = this.renderer.selected_pos;
			const [dr, dc] = bc;
			const dir = board.Direction.fromDifference(sr, sc, dr, dc);
			if(dir) {
				this.renderer.swap(sr, sc, dir);
				await this.renderer;
				const score = await this.do_mark_passes();
				if(score == 0) {
					this.renderer.swap(sr, sc, dir);
				} else {
					this.score += score;
				}
				this.renderer.selected_pos = null;
				this.renderer.update();
				return;
			}
		}
		this.renderer.selected_pos = bc;
		this.renderer.update();
	}

	async handle_key(ev) {
		console.log(ev);
		if(ev.key == "Control") {
			this.breathing = !this.breathing;
			this.renderer.amplitude = this.breathing? 0.005 : 0;
		}
		if(ev.key == "Shift") {
			this.shift_count++;
			if(this.shift_count == 5) {
				this.tile_idx = (this.tile_idx + 1) % ALL_TILE_SETS.length;
				this.board.tiles = ALL_TILE_SETS[this.tile_idx];
				this.renderer.render_tile_textures();
				this.shift_count = 0;
			}
		} else {
			this.shift_count = 0;
		}
	}

	async do_mark_passes() {
		let score = this.board.scoreRuns();
		if(score == 0) return score;
		while(true) {
			this.board.getMarks().forEach((rows, c) => rows.forEach(r => {
				this.renderer.animate_disappear(this.board.getAt(r, c));
			}));
			const motions = this.board.droppedTileMotions();
			motions.forEach(mot =>
				this.renderer.animate_motion(mot)
			);
			await this.renderer;
			this.board.resolveMotions(motions);
			this.renderer.sync_tiles();
			const add_score = this.board.scoreRuns();
			if(add_score == 0) {
				this.board.resetMarks();
				return score;
			}
			score += add_score;
		}
	}
}
