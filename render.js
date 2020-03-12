import * as anim from './anim.js';

const TILE_COLORS = [
	[255, 0, 0, 255],
	[255, 255, 0, 255],
	[0, 255, 0, 255],
	[0, 0, 255, 255],
	[255, 0, 255, 255],
	[127, 0, 0, 255],
	[0, 127, 0, 255],
];

const get_default_color = idx => TILE_COLORS[idx % TILE_COLORS.length];

const shader_vertex = `
attribute mediump vec2 a_pos;
attribute mediump vec2 a_uv;
uniform mediump vec2 u_offset;
uniform mediump vec2 u_off_scale;
uniform mediump float u_scale;
uniform highp float u_time;
uniform mediump float u_amplitude;
varying mediump vec2 v_uv;

void main(void) {
	vec2 center = u_off_scale * vec2(0.5, 0.5);
	vec2 transformed = ((a_pos - center) * u_scale + center) + u_offset * u_off_scale + vec2(
		u_amplitude * sin(u_offset.x + u_time),
		u_amplitude * cos(u_offset.y + u_time)
	);
	gl_Position = vec4(transformed * vec2(2, 2) - vec2(1, 1), 0, 1);
	v_uv = a_uv;
}`;

const shader_fragment = `
uniform sampler2D u_tex;
varying mediump vec2 v_uv;
uniform bool u_marked;
uniform mediump float u_blink;

void main(void) {
	mediump vec4 shade = u_marked ? vec4(u_blink, u_blink, u_blink, 0) : vec4(0, 0, 0, 0);
	gl_FragColor = shade + texture2D(u_tex, v_uv);
}`;


const shader_fragment_color = `
uniform mediump vec4 u_color;

void main(void) {
	gl_FragColor = u_color;
}`;

const DEFAULT_MOTION_DURATION = 350;
const DEFAULT_DISAPPEAR_DURATION = 250;

export class BoardRenderer {
	constructor(ctx, board) {
		this.ctx = ctx;
		this.board = board;

		this.ctx.clearColor(0.0, 0.0, 0.0, 1.0);

		this.render_tile_textures();
		this.sync_tiles();

		this.cell_dim = [1 / this.board.width, 1 / this.board.height];
		const [cw, ch] = this.cell_dim;

		this.cell_buffer = this.ctx.newBuffer();
		this.cell_buffer.set(new Float32Array([
			0, 0,
			cw, 0,
			cw, ch,
			0, ch,
		]));

		this.uv_buffer = this.ctx.newBuffer();
		this.uv_buffer.set(new Float32Array([
			0, 1,
			1, 1,
			1, 0,
			0, 0,
		]));

		this.index_buffer = this.ctx.newBuffer();
		this.index_buffer.set(
			new Uint16Array([0, 1, 2, 0, 2, 3]),
			this.ctx.gl.STATIC_DRAW,
			this.ctx.gl.ELEMENT_ARRAY_BUFFER,
		);

		this.sel_index_buffer = this.ctx.newBuffer();
		this.sel_index_buffer.set(
			new Uint16Array([0, 1, 1, 2, 2, 3, 3, 0]),
			this.ctx.gl.STATIC_DRAW,
			this.ctx.gl.ELEMENT_ARRAY_BUFFER,
		);

		this.vert_shader = this.ctx.newShader(this.ctx.gl.VERTEX_SHADER);
		this.vert_shader.source(shader_vertex);
		this.vert_shader.compile();

		this.frag_shader = this.ctx.newShader(this.ctx.gl.FRAGMENT_SHADER);
		this.frag_shader.source(shader_fragment);
		this.frag_shader.compile();

		this.frag_shader_color = this.ctx.newShader(this.ctx.gl.FRAGMENT_SHADER);
		this.frag_shader_color.source(shader_fragment_color);
		this.frag_shader_color.compile();

		this.prog = this.ctx.newProgram();
		this.prog.attach(this.vert_shader);
		this.prog.attach(this.frag_shader);
		this.prog.link();

		this.prog.u.u_off_scale.set(this.cell_dim);
		this.prog.u.u_amplitude.set(0.005);
		this.prog.a.a_pos.enableArray();
		this.prog.a.a_pos.bind(this.cell_buffer, 2);
		this.prog.a.a_uv.enableArray();
		this.prog.a.a_uv.bind(this.uv_buffer, 2);

		this.prog_color = this.ctx.newProgram();
		this.prog_color.attach(this.vert_shader);
		this.prog_color.attach(this.frag_shader_color);
		this.prog_color.link();

		this.prog_color.u.u_off_scale.set(this.cell_dim);
		this.prog_color.u.u_scale.set(1);
		this.prog_color.u.u_amplitude.set(0.005);
		this.prog_color.a.a_pos.enableArray();
		this.prog_color.a.a_pos.bind(this.cell_buffer, 2);

		this.needs_update = true;
		this.start = Date.now();
		this.anims_counter = 0;
		this.anims_finished_callbacks = [];
		this.hover_pos = null;
		this.selected_pos = null;
		this.renderer = new anim.OnFrame(this.render.bind(this));
	}

	set amplitude(v) {
		[this.prog, this.prog_color].forEach(prog => {
			prog.u.u_amplitude.set(v);
		});
	}

	render_tile_textures() {
		this.board.tiles.forEach((desc, i) => {
			if(!desc.tex) desc.tex = this.ctx.newTexture();
			if(desc.url) {
				desc.tex.load_url(desc.url);
			} else {
				desc.tex.load_color(get_default_color(i));
			}
		});
	}

	sync_tiles() {
		this.board.forEachTile((t, r, c) => {
			t.render_pos = [r, c];
			t.scale = 1;
		});
	}

	update() {
		this.needs_update = true;
	}

	render() {
		//if(!this.needs_update) return;

		this.ctx.clear();
		this.prog.use();

		const t = Date.now();
		const u = (t - this.start) / 1000;
		this.prog.u.u_time.set(u)
		this.prog_color.u.u_time.set(u);
		let blink = t / 1000 % 1;
		if(blink > 0.5) blink = 1 - blink;
		this.prog.u.u_blink.set(0.25 + blink);

		this.board.forEachTile(t => {
			if(!t.render_pos) return;
			const [r, c] = t.render_pos;
			this.prog.u.u_offset.set([c, r]);
			this.prog.u.u_scale.set(t.scale);
			let mark = t.mark;
			if(this.hover_pos) {
				const [hr, hc] = this.hover_pos;
				if(hr == r && hc == c) {
					mark = true;
				}
			}
			this.prog.u.u_marked.set(mark ? 1 : 0, true);
			this.prog.u.u_tex.set(t.descriptor.tex);
			this.prog.draw_indexed(
				this.ctx.gl.TRIANGLES,
				this.index_buffer,
				0, 6,
			);
		});

		if(this.selected_pos) {
			const [r, c] = this.selected_pos;
			this.prog_color.u.u_color.set(
				get_default_color(this.board.getAt(r, c).idx)
			);
			this.prog_color.u.u_offset.set([c, r]);
			this.prog_color.draw_indexed(
				this.ctx.gl.LINES,
				this.sel_index_buffer,
				0, 8,
			);
		}

		this.needs_update = false;
	}

	then(f) {
		this.anims_finished_callbacks.push(f);
	}

	decrement_anims() {
		this.anims_counter--;
		if(this.anims_counter == 0) {
			setTimeout(this.anims_finished.bind(this), 0);
		}
	}

	anims_finished() {
		this.anims_finished_callbacks.forEach(f => f());
		this.anims_finished_callbacks.length = 0;
		this.sync_tiles();
	}

	animate_motion(mot, dur) {
		if(dur == undefined) dur = DEFAULT_MOTION_DURATION;

		this.anims_counter++;

		(new anim.Animate(u => {
			mot.tile.render_pos = [
				mot.tr * u + mot.fr * (1 - u),
				mot.tc * u + mot.fc * (1 - u)
			];
			this.update();
		}, dur)).then(this.decrement_anims.bind(this));
	}

	animate_disappear(tile, dur) {
		if(dur == undefined) dur = DEFAULT_DISAPPEAR_DURATION;

		this.anims_counter++;

		(new anim.Animate(u => {
			tile.scale = 1 - u;
			this.update();
		}, dur)).then(this.decrement_anims.bind(this));
	}

	swap(r, c, d) {
		this.board.swap(r, c, d).forEach(mot => this.animate_motion(mot));
	}
}
