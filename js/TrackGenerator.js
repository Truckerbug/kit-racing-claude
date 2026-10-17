const CORNER_ORIENTATIONS = {
	5: 0,
	6: 16,
	9: 22,
	10: 10,
};

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
		const dx1 = previous[ 0 ] - point[ 0 ];
		const dz1 = previous[ 1 ] - point[ 1 ];
		const dx2 = next[ 0 ] - point[ 0 ];
		const dz2 = next[ 1 ] - point[ 1 ];
		let mask = 0;

		if ( dz1 < 0 || dz2 < 0 ) mask |= 8;
		if ( dz1 > 0 || dz2 > 0 ) mask |= 4;
		if ( dx1 > 0 || dx2 > 0 ) mask |= 2;
		if ( dx1 < 0 || dx2 < 0 ) mask |= 1;

		let type, orient;
		if ( mask === 3 || mask === 12 ) {

			type = 'track-straight';
			orient = mask === 3 ? 16 : 0;

		} else if ( CORNER_ORIENTATIONS[ mask ] !== undefined ) {

			type = 'track-corner';
			orient = CORNER_ORIENTATIONS[ mask ];

		} else {

			throw new Error( `Generated invalid road connections: ${ mask }` );

		}

		if ( i === 1 ) {

			type = 'track-finish';
			if ( dx2 > 0 ) orient = 22;
			else if ( dx2 < 0 ) orient = 16;
			else if ( dz2 < 0 ) orient = 0;
			else orient = 10;

		}

		cells.push( [ point[ 0 ] + offsetX, point[ 1 ] + offsetZ, type, orient ] );

	}

	return cells;

}
