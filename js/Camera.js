import * as THREE from 'three';

const _desired = new THREE.Vector3();
const _delta = new THREE.Vector3();
const _lookPoint = new THREE.Vector3();
const _cameraOffset = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _cameraQuaternion = new THREE.Quaternion();

export class Camera {

	constructor() {

		this.camera = new THREE.PerspectiveCamera( 40, window.innerWidth / window.innerHeight, 0.1, 60 );

		// Matches Godot View: 45° azimuth, 35° elevation, distance 16
		this.offset = new THREE.Vector3( 9.27, 9.18, 9.27 );
		this.mode = 0;
		this.chaseOffset = new THREE.Vector3( 0, 5, - 10 );
		this.firstPersonOffset = new THREE.Vector3( 0, 1.15, 0.65 );
		this.chaseLookAhead = 4;
		this.modeNames = [ 'angled', 'chase', 'first-person' ];

		this.camera.position.copy( this.offset );
		this.camera.lookAt( 0, 0, 0 );

		// Camera-aligned ground basis (XZ plane), derived from offset.
		// camRightXZ: screen-right projected to ground.
		// camForwardXZ: screen-up (away from camera) projected to ground.
		this.camRightXZ = new THREE.Vector3( this.offset.z, 0, - this.offset.x ).normalize();
		this.camForwardXZ = new THREE.Vector3( - this.offset.x, 0, - this.offset.z ).normalize();

		this.leadFactor = 3.0;
		this.cameraSmoothing = 2.0;
		this.deadzoneRadius = 5.0;
		this.screenShiftUp = 1.0;

		this.smoothedDesired = new THREE.Vector3();
		this.initialized = false;

		window.addEventListener( 'resize', () => {

			this.camera.aspect = window.innerWidth / window.innerHeight;
			this.camera.updateProjectionMatrix();

		} );

	}

	cycleMode() {

		this.mode = ( this.mode + 1 ) % this.modeNames.length;
		this.initialized = false;
		console.info( `Camera: ${ this.modeNames[ this.mode ] }` );

	}

	update( dt, target, velocity, rotation ) {

		if ( this.mode !== 0 ) {

			_cameraQuaternion.copy( rotation );

			if ( this.mode === 1 ) {

				_cameraOffset.copy( this.chaseOffset ).applyQuaternion( _cameraQuaternion );
				this.camera.position.copy( target ).add( _cameraOffset );
				_forward.set( 0, 0, 1 ).applyQuaternion( _cameraQuaternion );
				_lookPoint.copy( target ).addScaledVector( _forward, this.chaseLookAhead );
				_lookPoint.y += 0.6;

			} else {

				_cameraOffset.copy( this.firstPersonOffset ).applyQuaternion( _cameraQuaternion );
				this.camera.position.copy( target ).add( _cameraOffset );
				_forward.set( 0, 0, 1 ).applyQuaternion( _cameraQuaternion );
				_lookPoint.copy( this.camera.position ).addScaledVector( _forward, 10 );

			}

			this.camera.lookAt( _lookPoint );
			return;

		}

		const radius = this.deadzoneRadius;
		const radiusSq = radius * radius;

		// Lead = velocity projected onto camera-aligned ground basis, scaled, clamped to the deadzone disk.
		// Becomes the camera's offset from the car: car settles at the trailing edge of the circle.
		let leadX = velocity.dot( this.camRightXZ ) * this.leadFactor;
		let leadY = velocity.dot( this.camForwardXZ ) * this.leadFactor;
		const leadLenSq = leadX * leadX + leadY * leadY;
		if ( leadLenSq > radiusSq ) {

			const k = radius / Math.sqrt( leadLenSq );
			leadX *= k;
			leadY *= k;

		}

		_desired.copy( target )
			.addScaledVector( this.camRightXZ, leadX )
			.addScaledVector( this.camForwardXZ, leadY );

		const alpha = this.initialized ? 1 - Math.exp( - dt * this.cameraSmoothing ) : 1;
		this.smoothedDesired.lerp( _desired, alpha );
		this.initialized = true;

		// Hard-clamp: car must not escape the deadzone, even if the lerp lags at high speed.
		_delta.subVectors( target, this.smoothedDesired );
		const offsetX = _delta.dot( this.camRightXZ );
		const offsetY = _delta.dot( this.camForwardXZ );
		const offsetLenSq = offsetX * offsetX + offsetY * offsetY;
		if ( offsetLenSq > radiusSq ) {

			const offsetLen = Math.sqrt( offsetLenSq );
			const k = ( offsetLen - radius ) / offsetLen;
			this.smoothedDesired
				.addScaledVector( this.camRightXZ, offsetX * k )
				.addScaledVector( this.camForwardXZ, offsetY * k );

		}

		// Shift the entire view (camera + lookAt) so smoothedDesired sits higher on screen.
		_lookPoint.copy( this.smoothedDesired ).addScaledVector( this.camForwardXZ, - this.screenShiftUp );

		this.camera.position.copy( _lookPoint ).add( this.offset );
		this.camera.lookAt( _lookPoint );

	}

}
