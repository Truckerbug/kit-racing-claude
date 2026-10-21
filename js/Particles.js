import * as THREE from 'three';

const POOL_SIZE = 1280;
const PARTICLES_PER_EMIT = 3;
const EMIT_JITTER = 0.15;
const BASE_SIZE = 1;
const MAX_LIFE = 2.5;
const INV_MAX_LIFE = 1 / MAX_LIFE;

const _blPos = new THREE.Vector3();
const _brPos = new THREE.Vector3();

export class VehicleExplosion {

	constructor( scene ) {

		this.group = new THREE.Group();
		this.group.visible = false;
		scene.add( this.group );

		this.flashMaterial = new THREE.MeshBasicMaterial( {
			color: 0xffd86b,
			transparent: true,
			opacity: 0,
			depthWrite: false,
		} );
		this.flash = new THREE.Mesh( new THREE.SphereGeometry( 1, 12, 8 ), this.flashMaterial );
		this.group.add( this.flash );

		const geometry = new THREE.TetrahedronGeometry( 0.12, 0 );
		const colors = [ 0xff5a18, 0xffc247, 0x55565d ];
		this.sparks = [];

		for ( let i = 0; i < 30; i ++ ) {

			const material = new THREE.MeshBasicMaterial( {
				color: colors[ i % colors.length ],
				transparent: true,
				depthWrite: false,
			} );
			const mesh = new THREE.Mesh( geometry, material );
			mesh.visible = false;
			this.group.add( mesh );
			this.sparks.push( {
				mesh,
				material,
				velocity: new THREE.Vector3(),
				life: 0,
				maxLife: 0,
			} );

		}

		this.elapsed = Infinity;

	}

	trigger( position ) {

		this.group.position.copy( position );
		this.group.visible = true;
		this.elapsed = 0;
		this.flash.scale.setScalar( 0.1 );
		this.flashMaterial.opacity = 0.9;

		for ( const spark of this.sparks ) {

			const direction = new THREE.Vector3(
				Math.random() * 2 - 1,
				Math.random() * 1.5 + 0.2,
				Math.random() * 2 - 1
			).normalize();
			spark.mesh.position.set( 0, 0, 0 );
			spark.mesh.scale.setScalar( 0.6 + Math.random() * 1.2 );
			spark.mesh.rotation.set( Math.random() * 6, Math.random() * 6, Math.random() * 6 );
			spark.velocity.copy( direction ).multiplyScalar( 3 + Math.random() * 7 );
			spark.life = 0.45 + Math.random() * 0.45;
			spark.maxLife = spark.life;
			spark.material.opacity = 1;
			spark.mesh.visible = true;

		}

	}

	update( dt ) {

		if ( ! this.group.visible ) return;

		this.elapsed += dt;
		this.flash.scale.setScalar( 0.1 + this.elapsed * 7 );
		this.flashMaterial.opacity = Math.max( 0, 0.9 * ( 1 - this.elapsed / 0.22 ) );

		let active = this.elapsed < 0.22;
		for ( const spark of this.sparks ) {

			if ( spark.life <= 0 ) {

				spark.mesh.visible = false;
				continue;

			}

			spark.life -= dt;
			spark.velocity.y -= 9.8 * dt;
			spark.mesh.position.addScaledVector( spark.velocity, dt );
			spark.mesh.rotation.x += dt * 8;
			spark.mesh.rotation.z += dt * 6;
			spark.material.opacity = Math.max( 0, spark.life / spark.maxLife );
			if ( spark.life <= 0 ) spark.mesh.visible = false;
			else active = true;

		}

		if ( ! active ) this.group.visible = false;

	}

}

export class SmokeTrails {

	constructor( scene ) {

		const positions = new Float32Array( POOL_SIZE * 3 );
		const opacities = new Float32Array( POOL_SIZE );
		const sizes = new Float32Array( POOL_SIZE );

		const geometry = new THREE.BufferGeometry();

		const posAttr = new THREE.BufferAttribute( positions, 3 );
		posAttr.setUsage( THREE.DynamicDrawUsage );
		geometry.setAttribute( 'position', posAttr );

		const opacityAttr = new THREE.BufferAttribute( opacities, 1 );
		opacityAttr.setUsage( THREE.DynamicDrawUsage );
		geometry.setAttribute( 'aOpacity', opacityAttr );

		const sizeAttr = new THREE.BufferAttribute( sizes, 1 );
		sizeAttr.setUsage( THREE.DynamicDrawUsage );
		geometry.setAttribute( 'aSize', sizeAttr );

		const map = new THREE.TextureLoader().load( 'sprites/smoke.png' );

		const material = new THREE.PointsMaterial( {
			map,
			color: 0x5E5F6B,
			size: 1,
			sizeAttenuation: true,
			transparent: true,
			depthWrite: false,
		} );

		// PointsMaterial has no per-vertex size or alpha, so inject attributes
		// and fold them into gl_PointSize and diffuseColor.a.
		material.onBeforeCompile = ( shader ) => {

			shader.vertexShader = 'attribute float aSize;\nattribute float aOpacity;\nvarying float vOpacity;\n' + shader.vertexShader;
			shader.vertexShader = shader.vertexShader.replace(
				'void main() {',
				'void main() {\n\tvOpacity = aOpacity;'
			);
			shader.vertexShader = shader.vertexShader.replace(
				'gl_PointSize = size;',
				'gl_PointSize = size * aSize;'
			);

			shader.fragmentShader = 'varying float vOpacity;\n' + shader.fragmentShader;
			shader.fragmentShader = shader.fragmentShader.replace(
				'vec4 diffuseColor = vec4( diffuse, opacity );',
				'vec4 diffuseColor = vec4( diffuse, opacity * vOpacity );'
			);

		};

		const points = new THREE.Points( geometry, material );
		points.frustumCulled = false;
		scene.add( points );

		this.posAttr = posAttr;
		this.opacityAttr = opacityAttr;
		this.sizeAttr = sizeAttr;
		this.positions = positions;
		this.opacities = opacities;
		this.sizes = sizes;

		this.particles = [];

		for ( let i = 0; i < POOL_SIZE; i ++ ) {

			this.particles.push( {
				life: 0,
				velocity: new THREE.Vector3(),
				initialSize: 0,
			} );

		}

		this.emitIndex = 0;

	}

	update( dt, vehicle ) {

		const shouldEmit = vehicle.driftIntensity > 0.7;
		let aliveCount = 0;

		if ( shouldEmit ) {

			const roadY = vehicle.container.position.y + 0.05;
			const bl = vehicle.wheelBL ? vehicle.wheelBL.getWorldPosition( _blPos ) : null;
			const br = vehicle.wheelBR ? vehicle.wheelBR.getWorldPosition( _brPos ) : null;

			for ( let i = 0; i < PARTICLES_PER_EMIT; i ++ ) {

				if ( bl ) this.emitAt( bl.x, roadY, bl.z );
				if ( br ) this.emitAt( br.x, roadY, br.z );

			}

		}

		const damping = 1 - dt;

		for ( let i = 0; i < POOL_SIZE; i ++ ) {

			const p = this.particles[ i ];
			if ( p.life <= 0 ) continue;

			p.life -= dt;

			if ( p.life <= 0 ) {

				this.opacities[ i ] = 0;
				aliveCount ++;
				continue;

			}

			const t = 1 - p.life * INV_MAX_LIFE;

			p.velocity.multiplyScalar( damping );

			const posIdx = i * 3;
			this.positions[ posIdx ] += p.velocity.x * dt;
			this.positions[ posIdx + 1 ] += p.velocity.y * dt;
			this.positions[ posIdx + 2 ] += p.velocity.z * dt;

			this.opacities[ i ] = ( 1 - t ) * 0.25;
			this.sizes[ i ] = p.initialSize * ( 0.5 + t * 2.5 );

			aliveCount ++;

		}

		if ( shouldEmit || aliveCount > 0 ) {

			this.posAttr.needsUpdate = true;
			this.opacityAttr.needsUpdate = true;
			this.sizeAttr.needsUpdate = true;

		}

	}

	emitAt( x, y, z ) {

		const i = this.emitIndex;
		this.emitIndex = ( i + 1 ) % POOL_SIZE;

		const p = this.particles[ i ];

		const posIdx = i * 3;
		this.positions[ posIdx ] = x + ( Math.random() - 0.5 ) * EMIT_JITTER;
		this.positions[ posIdx + 1 ] = y + Math.random() * EMIT_JITTER;
		this.positions[ posIdx + 2 ] = z + ( Math.random() - 0.5 ) * EMIT_JITTER;

		p.initialSize = BASE_SIZE * ( 0.5 + Math.random() * 0.5 );

		p.velocity.set(
			( Math.random() - 0.5 ) * 0.2,
			0.5 + Math.random() * 0.5,
			( Math.random() - 0.5 ) * 0.2
		);

		p.life = MAX_LIFE;

	}

}
