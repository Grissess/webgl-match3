export class HasContext {
	constructor(ctx) {
		this.ctx = ctx;
	}

	get gl() {
		return this.ctx.gl;
	}
}

export class Buffer extends HasContext {
	constructor(ctx, name) {
		super(ctx);
		this.name = name;
	}

	bind(target) {
		if(target == undefined) target = this.gl.ARRAY_BUFFER;
		this.gl.bindBuffer(target, this.name);
	}

	set(data, usage, target) {
		if(usage == undefined) usage = this.gl.STATIC_DRAW;
		if(target == undefined) target = this.gl.ARRAY_BUFFER;
		this.bind(target);
		this.gl.bufferData(target, data, usage);
	}

	destroy() {
		this.gl.deleteBuffer(this.name);
	}
}

export const TEXTURE_PLACEHOLDER_DATA = new Uint8Array([
	255,0,255,255, 0,0,0,255,
	0,0,0,255, 255,0,255,255,
]), TEXTURE_PLACEHOLDER_DIMS = [2, 2],
	TEXTURE_PLACEHOLDER_FMT = "RGBA",
	TEXTURE_PLACEHOLDER_TYPE = "UNSIGNED_BYTE";

export class Texture extends HasContext {
	constructor(ctx, name) {
		super(ctx);
		this.name = name;
		this.unit = 0;
		this.wrap_s = this.gl.CLAMP_TO_EDGE;
		this.wrap_t = this.gl.CLAMP_TO_EDGE;
		this.min_filter = this.gl.NEAREST;
		this.mag_filter = this.gl.NEAREST;
		this.load_placeholder();
	}

	set wrap_s(v) {
		this.bind();
		this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, v);
	}

	set wrap_t(v) {
		this.bind();
		this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, v);
	}

	set min_filter(v) {
		this.bind();
		this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, v);
	}

	set mag_filter(v) {
		this.bind();
		this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, v);
	}

	bind(target) {
		if(target == undefined) target = this.gl.TEXTURE_2D;
		this.gl.bindTexture(target, this.name);
	}

	activate(unit, target) {
		if(unit == undefined) unit = this.unit;
		if(target == undefined) target = this.gl.TEXTURE_2D;
		this.unit = unit;
		this.gl.activeTexture(this.gl.TEXTURE0 + unit);
		this.bind(target);
	}

	load(image, format, type, target) {
		if(target == undefined) target = this.gl.TEXTURE_2D;
		if(format == undefined) format = this.gl.RGBA;
		if(type == undefined) type = this.gl.UNSIGNED_BYTE;
		this.bind(target);
		this.gl.texImage2D(target, 0, format, format, type, image);
	}

	load_data(data, width, height, format, type, target) {
		if(target == undefined) target = this.gl.TEXTURE_2D;
		if(format == undefined) format = this.gl.RGBA;
		if(type == undefined) type = this.gl.UNSIGNED_BYTE;
		this.bind(target);
		this.gl.texImage2D(target, 0, format, width, height, 0, format, type, data);
	}

	load_color(color, target) {
		if(target == undefined) target = this.gl.TEXTURE_2D;
		this.load_data(new Uint8Array(color), 1, 1);
	}

	load_placeholder() {
		const [w, h] = TEXTURE_PLACEHOLDER_DIMS;
		this.load_data(
			TEXTURE_PLACEHOLDER_DATA,
			w, h,
			this.gl[TEXTURE_PLACEHOLDER_FMT],
			this.gl[TEXTURE_PLACEHOLDER_TYPE],
		);
	}

	load_url(url) {
		this.ctx.image_queue.enqueue(this, url);
	}

	destroy() {
		this.gl.deleteTexture(this.name);
	}
}

export class ImageLoadingQueueEntry {
	constructor(tex, url, cb) {
		this.tex = tex;
		this.url = url;
		this.img = new Image();
		this.img.onload = (() => {
			cb(this.img);
		}).bind(this);
		this.img.src = url;
	}
}

export class ImageLoadingQueue {
	constructor() {
		this.queue = [];
		this.cur = null;
	}

	enqueue(tex, url) {
		new ImageLoadingQueueEntry(tex, url, img => {
			tex.load(img);
		});
	}
}

export class Shader extends HasContext {
	constructor(ctx, name) {
		super(ctx);
		this.name = name;
		this.compiled = false;
	}

	source(data) {
		this.gl.shaderSource(this.name, data);
		this.compiled = false;
	}

	compile() {
		if(this.compiled) return;
		this.gl.compileShader(this.name);
		if(!this.gl.getShaderParameter(this.name, this.gl.COMPILE_STATUS)) {
			throw new Error(this.gl.getShaderInfoLog(this.name));
		}
		this.compiled = true;
	}

	destroy() {
		this.gl.deleteShader(this.name);
	}
}

export class ProgramUniform extends HasContext {
	constructor(ctx, prog, index) {
		super(ctx);
		this.prog = prog;
		this.index = index;
		this.info = this.gl.getActiveUniform(prog.name, index);
		this.loc = this.gl.getUniformLocation(prog.name, this.info.name);
		if(this.loc == -1) throw new Error(`Uniform: unable to locate ${this.info.name}`);
	}

	set(v, forceint) {
		if(v instanceof Texture) {
			v.activate();
			this.set(v.unit, true);
			return;
		}
		if(v instanceof Array || v instanceof Int32Array) {
			if(v instanceof Int32Array) {
				forceint = true;
			}
			this.prog.use();
			this.gl['uniform' + v.length + (forceint? 'i' : 'f') + 'v'](this.loc, v);
			return;
		}
			this.prog.use();
		this.gl['uniform1' + (forceint? 'i' : 'f')](this.loc, v);
	}
}

export class ProgramAttribute extends HasContext {
	constructor(ctx, prog, index) {
		super(ctx);
		this.prog = prog;
		this.index = index;
		this.info = this.gl.getActiveAttrib(prog.name, index);
		this.loc = this.gl.getAttribLocation(prog.name, this.info.name);
		if(this.loc == -1) throw new Error(`Attribute: unable to locate ${this.info.name}`);
	}

	enableArray() {
		this.prog.use();
		this.gl.enableVertexAttribArray(this.loc);
	}

	disableArray() {
		this.prog.use();
		this.gl.disableVertexAttribArray(this.loc);
	}

	set(v) {
		if(v instanceof Float32Array) {
			this.disableArray();
			this.gl['vertexAttrib' + v.length + 'fv'](this.loc, v);
			return;
		}
		if(v instanceof Array) {
			this.set(new Float32Array(v));
			return;
		}
		this.disableArray();
		this.gl.vertexAttrib1f(this.loc, v);
	}

	bind(buf, components, type, norm) {
		if(components == undefined) components = 1;
		if(type == undefined) type = this.gl.FLOAT;
		if(norm == undefined) norm = false;
		this.prog.use();
		this.enableArray();
		buf.bind(this.gl.ARRAY_BUFFER);
		this.gl.vertexAttribPointer(this.loc, components, type, norm, 0, 0);
	}
}

export class Program extends HasContext {
	constructor(ctx, name) {
		super(ctx);
		this.name = name;
		this.linked = false;
	}

	attach(shader) {
		if(!shader.compiled) shader.compile();
		this.gl.attachShader(this.name, shader.name);
		this.linked = false;
	}

	link() {
		if(this.linked) return;
		this.gl.linkProgram(this.name);
		if(!this.gl.getProgramParameter(this.name, this.gl.LINK_STATUS)) {
			throw new Error(this.gl.getProgramInfoLog(this.name));
		}
		this.gl.validateProgram(this.name);
		if(!this.gl.getProgramParameter(this.name, this.gl.VALIDATE_STATUS)) {
			throw new Error(this.gl.getProgramInfoLog(this.name));
		}
		this.attribs = this.a = {};
		this.uniforms = this.u = {};
		this.num_attribs = this.gl.getProgramParameter(this.name, this.gl.ACTIVE_ATTRIBUTES);
		this.num_uniforms = this.gl.getProgramParameter(this.name, this.gl.ACTIVE_UNIFORMS);
		for(let i = 0; i < this.num_attribs; i++) {
			const attr = new ProgramAttribute(this.ctx, this, i);
			this.attribs[attr.info.name] = attr;
		}
		for(let i = 0; i < this.num_uniforms; i++) {
			const unif = new ProgramUniform(this.ctx, this, i);
			this.uniforms[unif.info.name] = unif;
		}
		console.log("link complete:", this);
		this.linked = true;
	}

	use() {
		if(!this.linked) this.link();
		this.gl.useProgram(this.name);
	}

	draw(prim, first, count) {
		this.use();
		this.gl.drawArrays(prim, first, count);
	}

	draw_indexed(prim, indices, first, count, type) {
		if(type == undefined) type = this.gl.UNSIGNED_SHORT;
		this.use();
		indices.bind(this.gl.ELEMENT_ARRAY_BUFFER);
		this.gl.drawElements(prim, count, type, first);
	}

	destroy() {
		this.gl.deleteProgram(this.name);
	}
}

export class GLContext {
	constructor(canvas) {
		this.canvas = canvas;
		this.gl = canvas.getContext('webgl');
		if(!this.gl) { throw new Error("Context initialization failed"); }
		this.image_queue = new ImageLoadingQueue();
	}

	enable(feature) {
		if(typeof feature == "string") {
			this.enable(this.gl[feature]);
			return;
		}
		this.gl.enable(feature);
	}

	disable(feature) {
		if(typeof feature == "string") {
			this.disable(this.gl[feature]);
			return;
		}
		this.gl.disable(feature);
	}

	clearColor(r, g, b, a) {
		this.gl.clearColor(r, g, b, a);
	}

	clear(buffers) {
		if(buffers == undefined) {
			buffers = this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT;
		}
		this.gl.clear(buffers);
	}

	newBuffer() {
		return new Buffer(this, this.gl.createBuffer());
	}

	newTexture() {
		return new Texture(this, this.gl.createTexture());
	}

	newShader(kind) {
		return new Shader(this, this.gl.createShader(kind));
	}

	newProgram() {
		return new Program(this, this.gl.createProgram());
	}
}
