export const Direction = {
	UP: (r, c) => [r+1, c],
	DOWN: (r, c) => [r-1, c],
	LEFT: (r, c) => [r, c-1],
	RIGHT: (r, c) => [r, c+1],
	fromDifference: (sr, sc, dr, dc) => {
		if(dr == sr + 1 && dc == sc) return Direction.UP;
		if(dr == sr - 1 && dc == sc) return Direction.DOWN;
		if(dr == sr && dc == sc - 1) return Direction.LEFT;
		if(dr == sr && dc == sc + 1) return Direction.RIGHT;
		return null;
	},
};

export class Tile {
	constructor(board, idx) {
		this.board = board;
		this.idx = idx;
		this.mark = false;
	}

	get descriptor() {
		return this.board.tiles[this.idx];
	}

	static random(board) {
		return new Tile(board, Math.floor(Math.random() * board.tiles.length));
	}
}

export class Motion {
	constructor(tile, fr, fc, tr, tc) {
		this.tile = tile;
		this.fr = fr;
		this.fc = fc;
		this.tr = tr;
		this.tc = tc;
	}

	get from() {
		return [this.fr, this.fc];
	}

	get to() {
		return [this.tr, this.tc];
	}
}

export class Board {
	constructor(width, height, tiles) {
		this.width = width;
		this.height = height;
		this.tiles = tiles;
		this.floaters = [];

		this.randomize();
	}

	randomize() {
		this.board = [];
		for(let row = 0; row < this.height; row++) {
			let tile_row = [];
			for(let col = 0; col < this.width; col++) {
				tile_row.push(Tile.random(this));
			}
			this.board.push(tile_row);
		}
	}

	forEachTile(f) {
		for(let row = 0; row < this.height; row++) {
			for(let col = 0; col < this.width; col++) {
				f(this.board[row][col], row, col, this);
			}
		}
		for(let floater of this.floaters) {
			f(floater, null, null, this);
		}
	}

	getAt(row, col) {
		if(row < 0 || row >= this.height || col < 0 || col >= this.width) {
			return null;
		}
		return this.board[row][col];
	}

	resetMarks() {
		this.forEachTile(t => t.mark = false);
	}

	scoreRuns() {
		let counter = 0;
		this.resetMarks();
		const checkMatchWith = (t, r1, c1, r2, c2) => {
			let prev = this.getAt(r1, c1), next = this.getAt(r2, c2);
			if(prev && next && prev.idx == t.idx && next.idx == t.idx) {
				prev.mark = true;
				t.mark = true;
				next.mark = true;
				return true;
			}
			return false;
		};
		this.forEachTile((t, r, c) => {
			if(checkMatchWith(t, r-1, c, r+1, c)) {
				counter++;
			}
			if(checkMatchWith(t, r, c-1, r, c+1)) {
				counter++;
			}
		});
		return counter;
	}

	getMarks() {
		let marks = (new Array(this.width)).fill(0).map(() => []);
		this.forEachTile((t, r, c) => {
			if(t.mark) {
				marks[c].push(r);
			}
		});
		return marks;
	}

	droppedTileMotions() {
		let motions = [];
		for(let col = 0; col < this.width; col++) {
			let low = 0, missing = 0;
			for(let row = 0; row < this.height; row++) {
				const tile = this.board[row][col];
				if(tile.mark) {
					missing++;
				} else {
					if(row > low) {
						motions.push(new Motion(tile, row, col, low, col));
					}
					low++;
				}
			}
			for(let i = 0; i < missing; i++) {
				const floater = Tile.random(this);
				this.floaters.push(floater);
				motions.push(new Motion(floater, this.height + i, col, this.height - missing + i, col));
			}
		}
		return motions;
	}

	resolveMotions(motions) {
		for(const mot of motions) {
			const [r, c] = mot.to;
			this.board[r][c] = mot.tile;
		}
		this.floaters.length = 0;
	}

	swap(row, col, dir) {
		const [nr, nc] = dir(row, col);
		const tile = this.getAt(nr, nc);
		if(!tile) return [];
		this.board[nr][nc] = this.board[row][col];
		this.board[row][col] = tile;
		return [
			new Motion(this.board[row][col], nr, nc, row, col),
			new Motion(this.board[nr][nc], row, col, nr, nc),
		];
	}
}
