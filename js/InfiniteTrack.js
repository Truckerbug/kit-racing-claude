import { rigidBody } from 'crashcat';
import { CELL_RAW, GRID_SCALE, OBSTACLE_TYPES, buildTrackChunk } from './Track.js';
import { buildWallColliders } from './Physics.js';
import { InfiniteTrackGenerator } from './TrackGenerator.js';

const CELLS_PER_CHUNK = 24;
const CHUNKS_AHEAD = 100;
const CHUNKS_BEHIND = 80;

export class InfiniteTrack {

	constructor( scene, models, world, seed ) {

		this.scene = scene;
		this.models = models;
		this.world = world;
		this.generator = new InfiniteTrackGenerator( seed );
		this.cellSize = CELL_RAW * GRID_SCALE;
		this.chunks = [];
		this.obstacleBodies = new Set();
		this.checkpointIndex = - 1;

		this.addChunk();
		this.addChunk();

	}

	addChunk() {

		const { cells, headings, incomingHeadings, startIndex, endIndex } = this.generator.generateChunk( CELLS_PER_CHUNK );
		const group = buildTrackChunk( this.scene, this.models, cells, headings, incomingHeadings );
		const chunkObstacleBodies = new Set();
		const bodies = buildWallColliders( this.world, null, cells, chunkObstacleBodies );
		const endZ = Math.max( ...cells.map( ( cell ) => ( cell[ 1 ] + 0.5 ) * this.cellSize ) );

		for ( const body of chunkObstacleBodies ) this.obstacleBodies.add( body );
		this.chunks.push( { cells, headings, incomingHeadings, startIndex, endIndex, group, bodies, obstacleBodies: chunkObstacleBodies, endZ } );

	}

	update( position, vehicle ) {

		while ( this.chunks[ this.chunks.length - 1 ].endZ < position.z + CHUNKS_AHEAD ) {

			this.addChunk();

		}

		this.updateCheckpoint( position, vehicle );

		while (
			this.chunks.length > 2 &&
			this.chunks[ 0 ].endZ < position.z - CHUNKS_BEHIND &&
			this.chunks[ 0 ].endIndex < this.checkpointIndex
		) {

			this.removeChunk( this.chunks.shift() );

		}

	}

	updateCheckpoint( position, vehicle ) {

		let nearestDistanceSq = 4.5 * 4.5;
		let nearest = null;

		for ( const chunk of this.chunks ) {

			for ( let i = 0; i < chunk.cells.length; i ++ ) {

				const index = chunk.startIndex + i;
				if ( index <= this.checkpointIndex ) continue;
				if ( OBSTACLE_TYPES.includes( chunk.cells[ i ][ 2 ] ) ) continue;

				const [ gx, gz ] = chunk.cells[ i ];
				const x = ( gx + 0.5 ) * this.cellSize;
				const z = ( gz + 0.5 ) * this.cellSize;
				const dx = position.x - x;
				const dz = position.z - z;
				const distanceSq = dx * dx + dz * dz;

				if ( distanceSq < nearestDistanceSq ) {

					nearestDistanceSq = distanceSq;
					nearest = { index, x, z, angle: chunk.headings[ i ] };

				}

			}

		}

		if ( ! nearest ) return;

		this.checkpointIndex = nearest.index;
		vehicle.spawnPosition = [ nearest.x, 0.5, nearest.z ];
		vehicle.spawnAngle = nearest.angle;

	}

	removeChunk( chunk ) {

		this.scene.remove( chunk.group );
		chunk.group.traverse( ( child ) => {

			if ( child.isInstancedMesh ) child.dispose();

		} );
		chunk.group.clear();

		for ( const body of chunk.bodies ) {

			rigidBody.remove( this.world, body );

		}

		for ( const body of chunk.obstacleBodies ) this.obstacleBodies.delete( body );

	}

}
