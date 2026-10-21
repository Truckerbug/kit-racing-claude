const CORNER_ORIENTATIONS = {
	5: 0,
	6: 16,
	9: 22,
	10: 10,
};

function createTrackCell( previous, point, next ) {

	const dx1 = previous[ 0 ] - point[ 0 ];
	const dz1 = previous[ 1 ] - point[ 1 ];
	const dx2 = next[ 0 ] - point[ 0 ];
	const dz2 = next[ 1 ] - point[ 1 ];
	let mask = 0;

	if ( dz1 < 0 || dz2 < 0 ) mask |= 8;
	if ( dz1 > 0 || dz2 > 0 ) mask |= 4;
	if ( dx1 > 0 || dx2 > 0 ) mask |= 2;
	if ( dx1 < 0 || dx2 < 0 ) mask |= 1;

	if ( mask === 3 || mask === 12 ) {

		return [ point[ 0 ], point[ 1 ], 'track-straight', mask === 3 ? 16 : 0 ];

	}

	if ( CORNER_ORIENTATIONS[ mask ] !== undefined ) {

		return [ point[ 0 ], point[ 1 ], 'track-corner', CORNER_ORIENTATIONS[ mask ] ];

	}

	throw new Error( `Generated invalid road connections: ${ mask }` );

}

function mulberry32( seed ) {

	let state = seed >>> 0;

	return () => {

		state += 0x6D2B79F5;
		let value = state;
		value = Math.imul( value ^ value >>> 15, value | 1 );
		value ^= value + Math.imul( value ^ value >>> 7, value | 61 );
		return ( value ^ value >>> 14 ) >>> 0;

	};

}

export function generateTrack( seed ) {

	const nextRandom = mulberry32( seed );
	const random = () => nextRandom() / 0x100000000;
	const randomInt = ( min, max ) => min + Math.floor( random() * ( max - min + 1 ) );
	const width = randomInt( 14, 20 );
	const depth = randomInt( 14, 20 );
	const path = [ [ 0, 0 ] ];
	let current = path[ 0 ];
	let lastObstacleIndex = - Infinity;

	function appendLine( target ) {

		while ( current[ 0 ] !== target[ 0 ] || current[ 1 ] !== target[ 1 ] ) {

			const dx = Math.sign( target[ 0 ] - current[ 0 ] );
			const dz = Math.sign( target[ 1 ] - current[ 1 ] );
			if ( dx && dz ) throw new Error( 'Track segments must be axis-aligned' );
			current = [ current[ 0 ] + dx, current[ 1 ] + dz ];
			path.push( current );

		}

	}

	function appendSide( length, dx, dz, ox, oz ) {

		const startX = current[ 0 ];
		const startZ = current[ 1 ];

		if ( length >= 14 && random() < 0.75 ) {

			const span = randomInt( 2, 5 );
			const offset = randomInt( 3, length - span - 3 );
			const outward = randomInt( 2, 3 );
			const start = [ startX + dx * offset, startZ + dz * offset ];
			const raisedStart = [ start[ 0 ] + ox * outward, start[ 1 ] + oz * outward ];
			const raisedEnd = [ raisedStart[ 0 ] + dx * span, raisedStart[ 1 ] + dz * span ];
			const end = [ start[ 0 ] + dx * span, start[ 1 ] + dz * span ];

			appendLine( start );
			appendLine( raisedStart );
			appendLine( raisedEnd );
			appendLine( end );

		}

		appendLine( [ startX + dx * length, startZ + dz * length ] );

	}

	appendSide( width, 1, 0, 0, - 1 );
	appendSide( depth, 0, 1, 1, 0 );
	appendSide( width, - 1, 0, 0, 1 );
	appendSide( depth, 0, - 1, - 1, 0 );

	if ( current[ 0 ] !== 0 || current[ 1 ] !== 0 ) throw new Error( 'Generated track did not close' );
	path.pop();

	const offsetX = - Math.floor( width / 2 );
	const offsetZ = - Math.floor( depth / 2 );
	const cells = [];

	for ( let i = 0; i < path.length; i ++ ) {

		const previous = path[ ( i + path.length - 1 ) % path.length ];
		const next = path[ ( i + 1 ) % path.length ];
		const point = path[ i ];
		const cell = createTrackCell( previous, point, next );
		let type = cell[ 2 ];
		let orient = cell[ 3 ];

		if ( i === 1 ) {

			type = 'track-finish';
			const dx2 = next[ 0 ] - point[ 0 ];
			const dz2 = next[ 1 ] - point[ 1 ];
			if ( dx2 > 0 ) orient = 22;
			else if ( dx2 < 0 ) orient = 16;
			else if ( dz2 < 0 ) orient = 0;
			else orient = 10;

		}

		if (
			type === 'track-straight' &&
			i > 1 &&
			i < path.length - 2 &&
			createTrackCell( path[ i - 2 ], path[ i - 1 ], point )[ 2 ] === 'track-straight' &&
			createTrackCell( point, next, path[ i + 2 ] )[ 2 ] === 'track-straight' &&
			i - lastObstacleIndex >= 2 &&
			random() < 0.5
		) {

			type = [ 'track-cones', 'track-barrels', 'track-tires' ][ randomInt( 0, 2 ) ];
			lastObstacleIndex = i;

		}

		cells.push( [ point[ 0 ] + offsetX, point[ 1 ] + offsetZ, type, orient ] );

	}

	return cells;

}

export class InfiniteTrackGenerator {

	constructor( seed ) {

		this.random = mulberry32( seed );
		this.obstacleRandom = mulberry32( ( seed ^ 0x9E3779B9 ) >>> 0 );
		this.path = [ [ 0, 0 ], [ 0, 1 ] ];
		this.pathStartIndex = 0;
		this.nextCellIndex = 0;
		this.lastObstacleIndex = - Infinity;

	}

	appendLine( dx, dz, length ) {

		const current = this.path[ this.path.length - 1 ];

		for ( let i = 0; i < length; i ++ ) {

			this.path.push( [ current[ 0 ] + dx * ( i + 1 ), current[ 1 ] + dz * ( i + 1 ) ] );

		}

	}

	extendPath() {

		const random = () => this.random() / 0x100000000;
		const randomInt = ( min, max ) => min + Math.floor( random() * ( max - min + 1 ) );

		this.appendLine( 0, 1, randomInt( 4, 7 ) );

		if ( random() < 0.9 ) {

			const direction = random() < 0.5 ? - 1 : 1;
			this.appendLine( direction, 0, randomInt( 2, 4 ) );

		}

	}

	generateChunk( count ) {

		if ( ! Number.isInteger( count ) || count < 1 ) throw new RangeError( 'Chunk size must be a positive integer' );

		const startIndex = this.nextCellIndex;
		const endIndex = startIndex + count - 1;

		while ( this.pathStartIndex + this.path.length <= endIndex + 2 ) this.extendPath();

		const cells = [];
		const headings = [];
		const incomingHeadings = [];
		const getPoint = ( index ) => this.path[ index - this.pathStartIndex ];

		for ( let index = startIndex; index <= endIndex; index ++ ) {

			const point = getPoint( index );
			const previous = index === 0 ? [ 0, - 1 ] : getPoint( index - 1 );
			const next = getPoint( index + 1 );

			const cell = createTrackCell( previous, point, next );

			if (
				cell[ 2 ] === 'track-straight' &&
				index > 2 &&
				createTrackCell( getPoint( index - 2 ), previous, point )[ 2 ] === 'track-straight' &&
				createTrackCell( point, next, getPoint( index + 2 ) )[ 2 ] === 'track-straight' &&
				index - this.lastObstacleIndex >= 2 &&
				this.obstacleRandom() / 0x100000000 < 0.5
			) {

				cell[ 2 ] = [ 'track-cones', 'track-barrels', 'track-tires' ][
					Math.floor( this.obstacleRandom() / 0x100000000 * 3 )
				];
				this.lastObstacleIndex = index;

			}

			cells.push( cell );
			headings.push( Math.atan2( next[ 0 ] - point[ 0 ], next[ 1 ] - point[ 1 ] ) );
			incomingHeadings.push( Math.atan2( point[ 0 ] - previous[ 0 ], point[ 1 ] - previous[ 1 ] ) );

		}

		this.nextCellIndex = endIndex + 1;
		const trimCount = Math.max( 0, this.nextCellIndex - 2 - this.pathStartIndex );
		if ( trimCount > 0 ) {

			this.path.splice( 0, trimCount );
			this.pathStartIndex += trimCount;

		}

		return { cells, headings, incomingHeadings, startIndex, endIndex };

	}

}
