import * as THREE from 'three';

//import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FilmPass } from 'three/examples/jsm/postprocessing/FilmPass.js';
import { mergeBufferGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { ExtrudeGeometry } from './ExtrudeGeometry.js';

import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';

const PostProcShader = {
    uniforms: {
        'tDiffuse': {
            value: null
        },
        'resolution': {
            value: [500, 500]
        },
        'seed1': {
            value: fxrandom(.5, 2.5)*0+1.0
        },
        'seed2': {
            value: fxrandom(.5, 1.5)
        },
        'seed3': {
            value: fxrandom(.5, 1.5)
        },
        'time': {
            value: 0
        },
    },
    vertexShader:
/* glsl */
`

    varying vec2 vUv;

    void main() {

        vUv = uv;

        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

    }`,
    fragmentShader:
/* glsl */
`

    #include <common>

    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float time;
    uniform float seed1;
    uniform float seed2;
    uniform float seed3;

    varying vec2 vUv;

    //uniform float sigma;     // The sigma value for the gaussian function: higher value means more blur
                         // A good value for 9x9 is around 3 to 5
                         // A good value for 7x7 is around 2.5 to 4
                         // A good value for 5x5 is around 2 to 3.5
                         // ... play around with this based on what you need :)

    //uniform float blurSize;  // This should usually be equal to
                            // 1.0f / texture_pixel_width for a horizontal blur, and
                            // 1.0f / texture_pixel_height for a vertical blur.

    const float pi = 3.14159265f;

    const float numBlurPixelsPerSide = 4.0f;
 

    vec4 blur(vec2 coor, float blurSize, vec2 direction){
        float sigma = 3.0;
        // Incremental Gaussian Coefficent Calculation (See GPU Gems 3 pp. 877 - 889)
        vec3 incrementalGaussian;
        incrementalGaussian.x = 1.0f / (sqrt(2.0f * pi) * sigma);
        incrementalGaussian.y = exp(-0.5f / (sigma * sigma));
        incrementalGaussian.z = incrementalGaussian.y * incrementalGaussian.y;
      
        vec4 avgValue = vec4(0.0f, 0.0f, 0.0f, 0.0f);
        float coefficientSum = 0.0f;
      
        // Take the central sample first...
        avgValue += texture2D(tDiffuse, coor.xy) * incrementalGaussian.x;
        coefficientSum += incrementalGaussian.x;
        incrementalGaussian.xy *= incrementalGaussian.yz;
      
        // Go through the remaining 8 vertical samples (4 on each side of the center)
        for (float i = 1.0f; i <= numBlurPixelsPerSide; i++) { 
          avgValue += texture2D(tDiffuse, coor.xy - i * blurSize * 
                                direction) * incrementalGaussian.x;         
          avgValue += texture2D(tDiffuse, coor.xy + i * blurSize * 
                                direction) * incrementalGaussian.x;         
          coefficientSum += 2. * incrementalGaussian.x;
          incrementalGaussian.xy *= incrementalGaussian.yz;
        }
      
        return avgValue / coefficientSum;
    }

    void main() {

        vec2 xy = gl_FragCoord.xy;
        vec2 uv = xy / resolution;
        
        float qq = pow(2.*abs(uv.x-.5), 2.)*.84;

        qq = pow(length((uv - .5)*vec2(1.,.72))/length(vec2(.35)), 2.) * .95 + .05;
        qq = 0.5;

        vec2 dir = uv - .5;
        dir = vec2(dir.y, -dir.x);
        dir = dir / length(dir);
        dir = vec2(1.0, 0.);

        vec4 texelB = blur(uv, qq*.15*1./resolution.x, dir);

        float lum = texelB.r * 0.3 + texelB.g * 0.59 + texelB.b * 0.11;
        lum = pow(lum, 0.15);
        vec4 texelGray = vec4(vec3( lum ), 1.0);
        texelGray = texelGray*0.5 + texelB*0.5;

        vec4 texel = texture2D( tDiffuse, (xy+vec2(+0.0, +0.0)) / resolution );
        vec4 texel0 = texture2D( tDiffuse, vec2(.5) );

        //vec4 res = texelB*(1.-qq) + texelGray*qq + .0*(-.5+rand(xy*.1));
        texelB.r = pow(texelB.r, seed1);
        //texelB.g = pow(texelB.g, seed2);
        //texelB.b = pow(texelB.b, seed3);
        vec4 res = texelB * (.9 + .2*(-.5+rand(vec2(rand(xy*1.31), rand(xy*3.31)))));

        float marg = 15.;
        if(xy.x < marg || xy.y < marg || xy.x > resolution.x-marg || xy.y > resolution.y-marg){
            res.rgb = vec3(.1);
        }

        res = res + .1*(-.5+rand(vec2(rand(xy*1.321), rand(xy*3.31))));


        gl_FragColor = vec4( res.rgb, 1.0 );

    }`
};


import {
	Triangle,
	Vector3
} from 'three';

/**
 * Utility class for sampling weighted random points on the surface of a mesh.
 *
 * Building the sampler is a one-time O(n) operation. Once built, any number of
 * random samples may be selected in O(logn) time. Memory usage is O(n).
 *
 * References:
 * - http://www.joesfer.com/?p=84
 * - https://stackoverflow.com/a/4322940/1314762
 */

const _face = new Triangle();
const _color = new Vector3();

class MeshSurfaceSampler {

	constructor( mesh ) {

		let geometry = mesh.geometry;

		if ( ! geometry.isBufferGeometry || geometry.attributes.position.itemSize !== 3 ) {

			throw new Error( 'THREE.MeshSurfaceSampler: Requires BufferGeometry triangle mesh.' );

		}

		if ( geometry.index ) {

			console.warn( 'THREE.MeshSurfaceSampler: Converting geometry to non-indexed BufferGeometry.' );

			geometry = geometry.toNonIndexed();

		}

		this.geometry = geometry;
		this.randomFunction = Math.random;

		this.positionAttribute = this.geometry.getAttribute( 'position' );
		this.colorAttribute = this.geometry.getAttribute( 'color' );
		this.weightAttribute = null;

		this.distribution = null;

	}

	setWeightAttribute( name ) {

		this.weightAttribute = name ? this.geometry.getAttribute( name ) : null;

		return this;

	}

	build() {

		const positionAttribute = this.positionAttribute;
		const weightAttribute = this.weightAttribute;

		const faceWeights = new Float32Array( positionAttribute.count / 3 );

		// Accumulate weights for each mesh face.

		for ( let i = 0; i < positionAttribute.count; i += 3 ) {

			let faceWeight = 1;

			if ( weightAttribute ) {

				faceWeight = weightAttribute.getX( i )
					+ weightAttribute.getX( i + 1 )
					+ weightAttribute.getX( i + 2 );

			}

			_face.a.fromBufferAttribute( positionAttribute, i );
			_face.b.fromBufferAttribute( positionAttribute, i + 1 );
			_face.c.fromBufferAttribute( positionAttribute, i + 2 );
            let faceArea = _face.getArea();
			faceWeight *= faceArea;
            //console.log("fa", faceWeight)

			faceWeights[ i / 3 ] = faceWeight;

		}

		// Store cumulative total face weights in an array, where weight index
		// corresponds to face index.

		this.distribution = new Float32Array( positionAttribute.count / 3 );

		let cumulativeTotal = 0;

		for ( let i = 0; i < faceWeights.length; i ++ ) {

			cumulativeTotal += faceWeights[ i ];

			this.distribution[ i ] = cumulativeTotal;

		}

		return this;

	}

	setRandomGenerator( randomFunction ) {

		this.randomFunction = randomFunction;
		return this;

	}

	sample( targetPosition, targetNormal, targetColor ) {

		const cumulativeTotal = this.distribution[ this.distribution.length - 1 ];

		const faceIndex = this.binarySearch( this.randomFunction() * cumulativeTotal );

		return this.sampleFace( faceIndex, targetPosition, targetNormal, targetColor );

	}

	binarySearch( x ) {

		const dist = this.distribution;
		let start = 0;
		let end = dist.length - 1;

		let index = - 1;

		while ( start <= end ) {

			const mid = Math.ceil( ( start + end ) / 2 );

			if ( mid === 0 || dist[ mid - 1 ] <= x && dist[ mid ] > x ) {

				index = mid;

				break;

			} else if ( x < dist[ mid ] ) {

				end = mid - 1;

			} else {

				start = mid + 1;

			}

		}

		return index;

	}

	sampleFace( faceIndex, targetPosition, targetNormal, targetColor ) {

		let u = this.randomFunction();
		let v = this.randomFunction();

		if ( u + v > 1 ) {

			u = 1 - u;
			v = 1 - v;

		}

		_face.a.fromBufferAttribute( this.positionAttribute, faceIndex * 3 );
		_face.b.fromBufferAttribute( this.positionAttribute, faceIndex * 3 + 1 );
		_face.c.fromBufferAttribute( this.positionAttribute, faceIndex * 3 + 2 );

		targetPosition
			.set( 0, 0, 0 )
			.addScaledVector( _face.a, u )
			.addScaledVector( _face.b, v )
			.addScaledVector( _face.c, 1 - ( u + v ) );

		if ( targetNormal !== undefined ) {

			_face.getNormal( targetNormal );

		}

		if ( targetColor !== undefined && this.colorAttribute !== undefined ) {

			_face.a.fromBufferAttribute( this.colorAttribute, faceIndex * 3 );
			_face.b.fromBufferAttribute( this.colorAttribute, faceIndex * 3 + 1 );
			_face.c.fromBufferAttribute( this.colorAttribute, faceIndex * 3 + 2 );

			_color
				.set( 0, 0, 0 )
				.addScaledVector( _face.a, u )
				.addScaledVector( _face.b, v )
				.addScaledVector( _face.c, 1 - ( u + v ) );

			targetColor.r = _color.x;
			targetColor.g = _color.y;
			targetColor.b = _color.z;

		}

		return this;

	}

}



// note about the fxrand() function 
// when the "fxhash" is always the same, it will generate the same sequence of
// pseudo random numbers, always

//----------------------
// defining features
//----------------------
// You can define some token features by populating the $fxhashFeatures property
// of the window object.
// More about it in the guide, section features:
// [https://fxhash.xyz/articles/guide-mint-generative-token#features]
//
// window.$fxhashFeatures = {
//   "Background": "Black",
//   "Number of lines": 10,
//   "Inverted": true
// }

let camera, scene, renderer, controls;
var vShader, fShader;
var svShader, sfShader;
var loaded = false;

var points;
var ress = 1000;
var baseWidth = 1;
var baseHeight = 1;
var canvasWidth = 1;
var canvasHeight = 1;
var winScale = 1.;
var pg;
var canvas;
var paletteCanvas;

var seed = fxrand()*10000;

function fxrandom(a, b){
    return a + (b - a)*fxrand();
}
var wind = 0.0;
var scrollscale = 1.3;
var globalIndex = 0;
var frameCount = 0;
var particlePositions = [];
var particleColors = [];
var particleSizes = [];
var particleAngles = [];
var particleIndices = [];

var horizon = fxrandom(0.7, 0.93);
var ptsMat;
var ptsss;
var treeGroundSpread;

var sunPos;
var sunColor;
var sunSpread;

var backgroundColor;

var composer;
var renderPass;
var postProcPass;
var bloomPass;

var offcl = [fxrandom(-42, 14), fxrandom(-37, 34), fxrandom(-37, 37)]
var skyclr = {
    a: [155, 121, 122, 255],
    ad: [88, 22, 22, 0],
    b: [88, 77, 83, 88],
    bd: [11, 55, 17, 88],
    c: [130, 85, 62, 255],
    cd: [39, 25, 22, 0],
}


var treeclr = {
    a: [174, 82, 70, 255],
    ad: [39, 25, 22, 0],
    b: [191, 95, 80, 255],
    bd: [39, 25, 22, 0],
    c: [164, 82, 70, 188],
    cd: [39, 25, 22, 33],
    d: [88, 77, 83, 118],
    dd: [11, 28, 17, 55],
}

var groundclr = {
    c: [166, 134, 69, 255],
    cd: [49, 25, 22, 0],
    b: [88, 77, 99, 188],
    bd: [11, 28, 17, 55],
    a: [200, 125, 62, 255],
    ad: [44, 25, 22, 0],
}

var orange = {
    a: [216, 85, 22, 255],
    ad: [39, 25, 22, 0],
    b: [88, 77, 83, 127],
    bd: [11, 28, 17, 127],
}

var indigo = { // old sky
    a: [102, 153, 220, 255],
    ad: [2, 5, 25, 0],
    b: [227, 233, 111, 16],
    bd: [5, 11, 111, 16],
}


var mouse = {
    'x': 0,
    'y': 0,
};

var mouseprev = {
    'x': 0,
    'y': 0,
};

function isMobile() {
    let check = false;
    (function(a){if(/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i.test(a)||/1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(a.substr(0,4))) check = true;})(navigator.userAgent||navigator.vendor||window.opera);
    return check;
  };

function power(p, g) {
    if (p < 0.5)
        return 0.5 * Math.pow(2*p, g);
    else
        return 1 - 0.5 * Math.pow(2*(1 - p), g);
}


function dist(x1, y1, x2, y2){
    return Math.sqrt((x2-x1)**2 + (y2-y1)**2);
}

function animate(time) {
    
    //requestAnimationFrame(animate);
    if(renderer){
        //scene.rotateY(.01);
        //scene.rotateX(.0041);
        //ptsss.material.uniforms.u_time.value = frameCount;
        ptsss.material.uniforms.u_winscale.value = winScale*window.devicePixelRatio;
        frameCount++;
        //postProcPass.uniforms.time.value = frameCount;
        controls.update();
        composer.render();
    }
    requestAnimationFrame(animate);
}



function draw(){
    //image(pg, 0, 0, canvas.width, canvas.height);
}

function getHorizon(x){
    var dispr = .5*baseHeight*(-.5*power(noise(x*0.003+3133.41), 3))
    return baseHeight*horizon + (1. - horizon*.8)*.6*baseHeight*(-.5*power(noise(x*0.003), 2)) + .3*dispr*fxrand();
}

function map(x, v1, v2, v3, v4){
    return (x-v1)/(v2-v1)*(v4-v3)+v3;
}

function max(x, y){
    if(x >= y)
        return x;
    return y;
}

function min(x, y){
    if(x <= y)
        return x;
    return y;
}

function constrain(x, a, b){
    return max(a, min(x, b));
}

function radians(angle){
    return angle/360.*2*3.14159;
}

function reset(){
	
    var ns = fxrandom(0, 100000);
    noiseSeed(ns);
    globalIndex = 0;
    scrollscale = 1.3;
    frameCount = 0;
    offcl = [fxrandom(-18, 18), fxrandom(-18, 18), fxrandom(-18, 18)]
    offcl = [0,0,0]
    seed = fxrand()*10000;
    horizon = fxrandom(0.24, 0.93);
    sunPos = [fxrandom(0.2, 0.9), horizon+fxrandom(-.1, .1)];
    sunSpread = fxrandom(1.85, 1.85);

    var hsv = [Math.pow(fxrand(), 2), fxrandom(0.2, 0.66), fxrandom(0.35, 0.55)]
    hsv[0] = fxrandom(0.5, 0.99)
    if(hsv[0] > 0.5){
        hsv[1] = fxrandom(0.2, 0.36)
    }
    backgroundColor = HSVtoRGB(hsv[0], hsv[1], hsv[2])

    while(myDot(backgroundColor, [0,1,0]) > 0.5){
        hsv = [Math.pow(fxrand()*.5, 2), fxrandom(0.2, 0.66), fxrandom(0.35, 0.55)]
        backgroundColor = HSVtoRGB(hsv[0], hsv[1], hsv[2])
    }
    backgroundColor = [0.07,0.11,0.13]
    

    wind = fxrandom(-.4, +.4);
    if(fxrand() < .5)
        wind = 3.14 + wind;

    canvasWidth = ress;
    canvasHeight = ress;

    var ww = window.innerWidth || canvas.clientWidth || body.clientWidth;
    var wh = window.innerHeight|| canvas.clientHeight|| body.clientHeight;

    baseWidth = ress-33;
    baseHeight = ress-33;

    winScale = ww / baseWidth;

    if(ww < ress+16 || wh < ress+16 || true){
        var mm = min(ww, wh);
        canvasWidth = mm-10*mm/ress;
        canvasHeight = mm-10*mm/ress;
        //baseWidth = mm-16-16;
        //baseHeight = mm-16-16;
    }

    ww = canvasWidth
    wh = canvasHeight


    /*if(ww/wh > 1){
        baseWidth = Math.round(ress * ww/wh)
        baseHeight = ress
    }
    else{
        baseWidth = ress
        baseHeight = Math.round(ress * wh/ww)
    }*/

    //groundclr.a[3] = 0;
    var rx, ry;
    var pixelData;
    rx = fxrand()*33+128;
    ry = fxrand()*33+128;
    pixelData = paletteCanvas.getContext('2d').getImageData(rx, ry, 1, 1).data;
    if(fxrand()<-1.5) groundclr.a = [pixelData[0], pixelData[1], pixelData[2], 255];
    rx += fxrand()*88-44;
    ry += fxrand()*88-44;
    pixelData = paletteCanvas.getContext('2d').getImageData(rx, ry, 1, 1).data;
    if(fxrand()<-1.5) groundclr.b = [pixelData[0], pixelData[1], pixelData[2], 255*(fxrand()<2.5)];
    rx += fxrand()*88-44;
    ry += fxrand()*88-44;
    pixelData = paletteCanvas.getContext('2d').getImageData(rx, ry, 1, 1).data;
    if(fxrand()<-1.5) groundclr.c = [pixelData[0], pixelData[1], pixelData[2], 255*(fxrand()<2.5)];

    rx += fxrand()*33-16;
    ry += fxrand()*33-16;
    pixelData = paletteCanvas.getContext('2d').getImageData(rx, ry, 1, 1).data;
    if(fxrand()<-1.5) skyclr.a = [pixelData[0], pixelData[1], pixelData[2], 255];
    rx += fxrand()*33-16;
    ry += fxrand()*33-16;
    pixelData = paletteCanvas.getContext('2d').getImageData(rx, ry, 1, 1).data;
    if(fxrand()<-1.5) skyclr.b = [pixelData[0], pixelData[1], pixelData[2], 188];
    rx += fxrand()*33-16;
    ry += fxrand()*33-16;
    pixelData = paletteCanvas.getContext('2d').getImageData(rx, ry, 1, 1).data;
    if(fxrand()<-1.5) skyclr.c = [pixelData[0], pixelData[1], pixelData[2], 188];
    
    rx += fxrand()*66-36;
    ry += fxrand()*66-36;
    pixelData = paletteCanvas.getContext('2d').getImageData(rx, ry, 1, 1).data;
    if(fxrand()<-1.5) treeclr.a = [pixelData[0], pixelData[1], pixelData[2], 255];
    rx += fxrand()*66-36;
    ry += fxrand()*66-36;
    pixelData = paletteCanvas.getContext('2d').getImageData(rx, ry, 1, 1).data;
    if(fxrand()<-1.5) treeclr.b = [pixelData[0], pixelData[1], pixelData[2], 188];
    rx += fxrand()*66-36;
    ry += fxrand()*66-36;
    pixelData = paletteCanvas.getContext('2d').getImageData(rx, ry, 1, 1).data;
    if(fxrand()<-1.5) treeclr.c = [pixelData[0], pixelData[1], pixelData[2], 255];

    //resizeCanvas(ww, wh, true);
    //pg = createGraphics(ww, wh);

    particlePositions = [];
    particleColors = [];
    particleSizes = [];
    particleAngles = [];
    particleIndices = [];

    loadShadersAndData();

    

}

function loadShadersAndData(){
    
    //const material = new THREE.PointsMaterial( { size: 15, vertexColors: true } );
    var loader = new THREE.FileLoader();
    var numFilesLeft = 4;
    function runMoreIfDone() {
        --numFilesLeft;
        if (numFilesLeft === 0) {
            loadData();
        }
    }
    loader.load('./assets/shaders/particle.frag',function ( data ) {fShader =  data; runMoreIfDone(); },);
    loader.load('./assets/shaders/particle.vert',function ( data ) {vShader =  data; runMoreIfDone(); },);
    loader.load('./assets/shaders/sphere.frag',function ( data ) {sfShader =  data; runMoreIfDone(); },);
    loader.load('./assets/shaders/sphere.vert',function ( data ) {svShader =  data; runMoreIfDone(); },);
}

function createScattered(surface){
    const sampler = new MeshSurfaceSampler( surface )

	sampler.setWeightAttribute( 'color' ).build();

    let npoints = 11010;
    const instanceGeo = new THREE.SphereGeometry( 1.6,5,5);
    const instanceMat = new THREE.MeshBasicMaterial( { color: 0xababab } );
    const sampleMesh = new THREE.InstancedMesh( instanceGeo, instanceMat, npoints );
    const _position = new THREE.Vector3();
    const _matrix = new THREE.Matrix4();

    var kk = 0;
    var existing = [];
    while(existing.length < npoints){
        kk++;
        if(existing.length == 0){
            sampler.sample( _position );
            existing.push(new THREE.Vector3().copy(_position));
        }
        else{
            var mmaxd = -10000;
            var thepoint = new THREE.Vector3();
            for(var qq = 0; qq < 10; qq++){
                sampler.sample( _position );
                var mind = 10000;
                for(var ee = 0; ee < existing.length; ee++){
                    let dd = existing[ee].distanceTo(_position);
                    if(dd < mind){
                        mind = dd;
                    }
                }
                if(mind > mmaxd){
                    mmaxd = mind;
                    thepoint = thepoint.copy(_position);
                }
            }
            existing.push(thepoint);
        }
    }
    for ( let i = 0; i < npoints; i ++ ) {
        _matrix.makeTranslation( existing[i].x, existing[i].y, existing[i].z + 0 );
        sampleMesh.setMatrixAt( i, _matrix );
    }
    sampleMesh.instanceMatrix.needsUpdate = true;

    return sampleMesh;
}

function createObject(){
    //const boxes = new THREE.BufferGeometry();
    var ccc;
    var geos = [];
    var ppcolors = [];
    var lines = [];
    for(var qqq = 0; qqq < 13; qqq++){
        //const sphereGeo = new THREE.SphereGeometry( fxrandom(30, 122), 30, 30);
        const ow = fxrandom(30, 166);
        const oh = fxrandom(30, 166);
        const od = fxrandom(30, 166);
        const ox = fxrandom(-222, 222);
        const oy = fxrandom(-222, 222);
        const oz = fxrandom(-222, 222);
        
        const objectGeo = new THREE.BoxGeometry( ow, oh, od);
        const objectMat = new THREE.MeshBasicMaterial( { side: THREE.DoubleSide, color: new THREE.Color("rgb("+Math.round(backgroundColor[0]*255)+", "+Math.round(backgroundColor[1]*255)+", "+Math.round(backgroundColor[2]*255)+")") } );
        
        //const objectMat = new THREE.MeshBasicMaterial( {vertexColors: false} );
        const object = new THREE.Mesh( objectGeo, objectMat );
        const transformMat = new THREE.Mesh();
        ccc = object;
        //transformMat.rotateX(4*fxrand());
        //transformMat.rotateY(4*fxrand());
        //transformMat.rotateZ(4*fxrand());
        transformMat.translateX(ox)
        transformMat.translateY(oy)
        transformMat.translateZ(oz)
        transformMat.updateMatrix();
        object.geometry.applyMatrix4( transformMat.matrix )
    
        var coo = fxrand();
        if(qqq%2 == 0){
            coo = 0.1;
        }
        else{
            coo = 0.9;
        }
        var pcolors = [];
        for(var ppp = 0; ppp < objectGeo.attributes.position.count; ppp++){
            var nx = objectGeo.attributes.normal.array[ppp*3+0];
            var ny = objectGeo.attributes.normal.array[ppp*3+1];
            var nz = objectGeo.attributes.normal.array[ppp*3+2];
            var px = objectGeo.attributes.position.array[ppp*3+0];
            var py = objectGeo.attributes.position.array[ppp*3+1];
            var pz = objectGeo.attributes.position.array[ppp*3+2];
            coo = Math.pow(Math.abs(px)/200., 4);
            
            if(fxrand() < .5){
                coo = 0.1;
            }
            else{
                coo = 0.9;
            }
            coo = 0.1;
            coo = 0.9;
            pcolors.push(coo, coo, coo)
        }
        
        ppcolors = ppcolors.concat(pcolors);
        //object.matrix.needsUpdate = true;
        //console.log(object)
        //scene.add( object );
        //boxGroup.add( object );
        //object.geometry.merge(boxes, qqq);

        if(true){
            lines.push(createLine(new THREE.Vector3(ox+ow/2, oy+oh/2, oz+od/2), new THREE.Vector3(ox+ow/2, oy+oh/2, oz-od/2), fxrand()))
            lines.push(createLine(new THREE.Vector3(ox+ow/2, oy-oh/2, oz+od/2), new THREE.Vector3(ox+ow/2, oy-oh/2, oz-od/2), fxrand()))
            lines.push(createLine(new THREE.Vector3(ox-ow/2, oy-oh/2, oz+od/2), new THREE.Vector3(ox-ow/2, oy-oh/2, oz-od/2), fxrand()))
            lines.push(createLine(new THREE.Vector3(ox-ow/2, oy+oh/2, oz+od/2), new THREE.Vector3(ox-ow/2, oy+oh/2, oz-od/2), fxrand()))
            lines.push(createLine(new THREE.Vector3(ox+ow/2, oy+oh/2, oz+od/2), new THREE.Vector3(ox+ow/2, oy-oh/2, oz+od/2), fxrand()))
            lines.push(createLine(new THREE.Vector3(ox+ow/2, oy+oh/2, oz-od/2), new THREE.Vector3(ox+ow/2, oy-oh/2, oz-od/2), fxrand()))
            lines.push(createLine(new THREE.Vector3(ox-ow/2, oy+oh/2, oz+od/2), new THREE.Vector3(ox-ow/2, oy-oh/2, oz+od/2), fxrand()))
            lines.push(createLine(new THREE.Vector3(ox-ow/2, oy+oh/2, oz-od/2), new THREE.Vector3(ox-ow/2, oy-oh/2, oz-od/2), fxrand()))
            lines.push(createLine(new THREE.Vector3(ox+ow/2, oy+oh/2, oz+od/2), new THREE.Vector3(ox-ow/2, oy+oh/2, oz+od/2), fxrand()))
            lines.push(createLine(new THREE.Vector3(ox+ow/2, oy+oh/2, oz-od/2), new THREE.Vector3(ox-ow/2, oy+oh/2, oz-od/2), fxrand()))
            lines.push(createLine(new THREE.Vector3(ox+ow/2, oy-oh/2, oz+od/2), new THREE.Vector3(ox-ow/2, oy-oh/2, oz+od/2), fxrand()))
            lines.push(createLine(new THREE.Vector3(ox+ow/2, oy-oh/2, oz-od/2), new THREE.Vector3(ox-ow/2, oy-oh/2, oz-od/2), fxrand()))
        }
        //geos.push(lineGeo);
        
        geos.push(objectGeo);
    
    }
    const boxes = mergeBufferGeometries(geos)
    boxes.setAttribute( 'color', new THREE.Float32BufferAttribute(ppcolors, 3) );
    ccc.geometry.setAttribute( 'color', new THREE.Float32BufferAttribute(ppcolors, 3) );

    //const boxxxMat = new THREE.MeshBasicMaterial( { color: new THREE.Color("rgb("+Math.round(backgroundColor[0]*255)+", "+Math.round(backgroundColor[1]*255)+", "+Math.round(backgroundColor[2]*255)+")") } );
    const boxxxMat = new THREE.MeshBasicMaterial( {vertexColors: true} );
    const boxxx = new THREE.Mesh( boxes, boxxxMat );

    return {'geo': boxxx, 'lines': lines}
}

function createLine(p1, p2, seed){
    const linematerial = new THREE.LineBasicMaterial( { color: 0x222222, linewidth: 5, } );

    const detail = 3;
    const d = p1.distanceTo(p2);
    const parts = Math.round(d / detail);
    const linePoints = [];
    for(var qq = 0; qq < parts; qq++){
        var xx = map(qq, 0, parts-1, p1.x, p2.x);
        var yy = map(qq, 0, parts-1, p1.y, p2.y);
        var zz = map(qq, 0, parts-1, p1.z, p2.z);
        var x = xx + 0*5*(-.5+power(noise(xx*.01, yy*.01, zz*.01+31.13*213.31*seed), 3));
        var y = yy + 0*5*(-.5+power(noise(xx*.01, yy*.01, zz*.01+22.98*213.31*seed), 3));
        var z = zz + 0*5*(-.5+power(noise(xx*.01, yy*.01, zz*.01+55.55*213.31*seed), 3));
        linePoints.push( new THREE.Vector3( x, y, z ) );
    }
    const scurve = new THREE.CatmullRomCurve3( linePoints );
    const ccpoints = scurve.getPoints( parts );
    const linegeo = new THREE.BufferGeometry().setFromPoints( ccpoints );
    const line = new THREE.Line( linegeo, linematerial );
    
    const scurve2 = new THREE.CatmullRomCurve3( ccpoints );

    const shape = new THREE.Shape();
    shape.moveTo( -10, -10 );
    shape.lineTo( -10, +10 );
    shape.lineTo( +10, +10 );
    shape.lineTo( +10, -10 );
    shape.lineTo( -10, -10 );

    let steps = parts;
    var radii = [];
    var begg = 5;
    for(var s = 0; s <= steps; s++){
        radii[s] = .015 + .03*power(noise(s*.1, seed*55.22), 3);

        var p = 1;
        if(steps>begg*3){
            if(s<=begg){
                p *= map(s, 0, begg, 3, 0);
            }
            else if(s>steps-begg){
                p *= map(s, steps-begg, steps, 0, 3);
            }
            else
                p = 0;
            p = map(p, 0, 1, 0.5, 1);
        }
        radii[s] *= 5;
    }

    const extrudeSettings = {
        steps: steps,
        depth: 56,
        bevelEnabled: true,
        bevelThickness: 1,
        bevelSize: 1,
        bevelOffset: 0,
        bevelSegments: 1,
        extrudePath: scurve2,
        extrudeRadii: radii,
    };
    const egeometry = new ExtrudeGeometry( shape, extrudeSettings );
    //const ematerial = new THREE.MeshBasicMaterial( { color: 0x00ff00 } );
    const ematerial = new THREE.MeshBasicMaterial( { color: new THREE.Color("rgb(244, 244, 244)") } );
    
    const emesh = new THREE.Mesh( egeometry, ematerial ) 
    
    return emesh
}

function loadData(){
    /*
    canvas2 = document.createElement("canvas");
    canvas2.id = "hello"
    canvas2.width = ww;
    canvas2.height = wh;
    canvas2.style.position = 'absolute';
    canvas2.style.left = '0px';
    canvas2.style.top = '0px';
    canvas2.style.z_index = '1111';
    console.log(canvas2)
    document.body.append(canvas2)
    */
    winScale = canvasWidth / ress;
    camera = new THREE.OrthographicCamera(-canvasWidth/2/winScale, canvasWidth/2/winScale, canvasHeight/2/winScale, -canvasHeight/2/winScale, 1, 6000);
    //camera = new THREE.OrthographicCamera( 1000 * 1. / - 2, 1000 * 1. / 2, 1000 / 2, 1000 / - 2, 1, 4000 );
    //camera = new THREE.PerspectiveCamera( 27, canvasWidth / canvasHeight, 5, 3500 );
    camera.position.z = 1000;
    

    var ff = true;
    if(scene)
        ff = false;
    scene = new THREE.Scene();


    var rx = fxrand()*256;
    var ry = fxrand()*256;
    var pixelData = paletteCanvas.getContext('2d').getImageData(rx, ry, 1, 1).data;
    //backgroundColor = [pixelData[0]/255., pixelData[1]/255., pixelData[2]/255.];

    scene.background = new THREE.Color( backgroundColor[0], backgroundColor[1], backgroundColor[2]);
    //scene.fog = new THREE.Fog( 0x050505, 2000, 3500 );

    //
    
    //var myObject = createObject();
    //scene.add(myObject.geo);
    //myObject.lines.forEach(element => {
    //    scene.add(element);
    //});

    var v1 = map(fxrand(), 0, 1, 2, 22);
    var v2 = 24 - v1;
    var scustomUniforms = {
        time: { value: frameCount },
        pl1: { value: [fxrand()*2-1,fxrand()*2-1,fxrand(),v1] },
        pl2: { value: [fxrand()*2-1,fxrand()*2-1,fxrand(),v2] },
    };
    const smaterial = new THREE.ShaderMaterial( {
        uniforms: scustomUniforms,
        vertexShader: svShader,
        fragmentShader: sfShader,
        transparent:  true
      });

    for(var ww = 0; ww < 0; ww++){
        var rad = map(fxrand(), 0, 1, 33, 233);
        rad = map(ww, 0, 111, 30, 300)
        const sphereGeo = new THREE.SphereGeometry( rad,rad,rad);
        const sphere = new THREE.Mesh( sphereGeo, smaterial );
        sphere.position.x = map(fxrand(), 0, 1, -200, 200);
        sphere.position.y = map(fxrand(), 0, 1, -200, 200);
        sphere.position.z = -ww*222;
        sphere.rotation.x = fxrand();
        sphere.rotation.y = fxrand();
        sphere.rotation.z = fxrand();
        scene.add( sphere );
    }

    var p1 = new THREE.Vector3(100, 140, 333);
    var p2 = new THREE.Vector3(-210, 240, 133);
    //var myLine = createLine(p1, p2, fxrand());
    //scene.add(myLine);

    //var scattered = createScattered(myObject);
    //scene.add( scattered );

    const cparticlePositions = [];
    const cparticleAxis = [];
    const cparticleColors = [];
    const cparticleSizes = [];
    const cparticleAngles = [];
    const cparticleIndices = [];
    var amp = ress/36;
    var frq = 0.001;
    var nn = 2233;
    for ( let i = 0; i < nn; i ++ ) {
        //sampler.sample( _position );
        //console.log(_position)
        //_position.applyMatrix4 (sphere.matrix);
        //console.log(_position)
        var x = amp * (-.5 + power(noise(i*frq, 3131.), 3)) * map(i, 0, 66, 0, 1);
        var y = amp * (-.5 + power(noise(i*frq, 1131.), 3)) * map(i, 0, 66, 0, 1);
        var z = map(i, 0, nn, 0, 111);
        var br = map(i, 0, nn, 0, 1);
        var sz = map(i, 0, nn, 0, 1);
        sz = Math.pow(sz, 1./22.);
        sz = map(sz, 0, 1, 3777, 4);
        var ss = 1 + 3.*noise(i*0.01);

        var cc1 = HSVtoRGB((i/nn*.1+.33)%1., 0.7, 0.8);
        var cc2 = HSVtoRGB((i/nn*.1+.03)%1., 0.9, 0.8);

        cparticlePositions.push( ss, 0, 0 );
        cparticleAxis.push( x, y, z );
        cparticleColors.push( cc1[0], cc1[1], cc1[2], 1.0 );
        cparticleSizes.push( sz, sz );
        cparticleAngles.push( fxrand() );
        cparticleIndices.push( i*2 );

        cparticlePositions.push( -ss, 0, 0 );
        cparticleAxis.push( x, y, z );
        cparticleColors.push( cc2[0], cc2[1], cc2[2], 1.0 );
        cparticleSizes.push( sz, sz );
        cparticleAngles.push( fxrand() );
        cparticleIndices.push( i*2+1 );

    }

    const ptsGeo = new THREE.BufferGeometry();
    ptsGeo.setAttribute( 'position', new THREE.Float32BufferAttribute( cparticlePositions, 3 ) );
    ptsGeo.setAttribute( 'axis', new THREE.Float32BufferAttribute( cparticleAxis, 3 ) );
    ptsGeo.setAttribute( 'color', new THREE.Float32BufferAttribute( cparticleColors, 4 ) );
    ptsGeo.setAttribute( 'size', new THREE.Float32BufferAttribute( cparticleSizes, 2 ) );
    ptsGeo.setAttribute( 'angle', new THREE.Float32BufferAttribute( cparticleAngles, 1 ) );
    ptsGeo.setAttribute( 'index', new THREE.Float32BufferAttribute( cparticleIndices, 1 ) );
    
    var pUniforms = {
        'u_time': {'value': 0},
        'u_winscale': {'value': winScale*window.devicePixelRatio},
    };
    ptsMat = new THREE.ShaderMaterial( {
        uniforms: pUniforms,
        vertexShader: vShader,
        fragmentShader: fShader,
        transparent:  true,
      });

    ptsss = new THREE.Points( ptsGeo, ptsMat );
    scene.add( ptsss );
    
    

    if(ff)
        renderer = new THREE.WebGLRenderer({alpha: true, antialias: false});
    //renderer.setPixelRatio( 1.0 );
    renderer.setPixelRatio( window.devicePixelRatio );
    renderer.setSize( canvasWidth, canvasHeight );

    controls = new OrbitControls( camera, renderer.domElement );

    renderer.domElement.id = "cnvs"
    //renderer.domElement.style.position = "absolute";
    //renderer.domElement.style.left = "0px";
    //renderer.domElement.style.top = "0px";
    if(ff)
        document.body.appendChild( renderer.domElement );

    repositionCanvas(renderer.domElement);

    if(canvasWidth < canvasHeight || canvasWidth < ress || canvasHeight < ress)
      renderer.domElement.style.borderWidth = "0px";
    else
        renderer.domElement.style.borderWidth = "0px";


    composer = new EffectComposer( renderer );
    renderPass = new RenderPass( scene, camera );
    PostProcShader.uniforms.resolution.value = [canvasWidth*window.devicePixelRatio, canvasHeight*window.devicePixelRatio];
    postProcPass = new ShaderPass( PostProcShader );
    composer.addPass(renderPass);
    
    var fxaaPass = new ShaderPass( FXAAShader );
    fxaaPass.material.uniforms[ 'resolution' ].value.x = 1 / ( canvasWidth*window.devicePixelRatio );
    fxaaPass.material.uniforms[ 'resolution' ].value.y = 1 / ( canvasHeight*window.devicePixelRatio );
    composer.addPass( fxaaPass );

    bloomPass = new FilmPass();
    composer.addPass( postProcPass );
    composer.render();
    //renderer.render( scene, camera );
    fxpreview();
    requestAnimationFrame(animate);
    //window.addEventListener( 'resize', onWindowResize );
}


function repositionCanvas(canvas){
    var win = window;
    var doc = document;
    var body = doc.getElementsByTagName('body')[0];
    var ww = win.innerWidth;
    var wh = win.innerHeight;
    
    if(isMobile()){
      //canvas.width = ww;
      //canvas.height = wh;
      //canvas.style.borderWidth = "6px";
    }
    else{
      //canvas.width = Math.min(ww, wh) - 130;
      //canvas.height = Math.min(ww, wh) - 130;
    }

    canvas.style.position = 'absolute';
    canvas.style.left = (ww - canvasWidth)/2 + 'px';
    canvas.style.top = (wh - canvasHeight)/2 + 'px'; // ovih 6 je border
    
}

var cnt = 0

var shft = fxrandom(0.6, 1.05)%1.0;
var shft2 = fxrandom(0.0, 1.0)%1.0;


function HSVtoRGB(h, s, v) {
    var r, g, b, i, f, p, q, t;
    if (arguments.length === 1) {
        s = h.s, v = h.v, h = h.h;
    }
    i = Math.floor(h * 6);
    f = h * 6 - i;
    p = v * (1 - s);
    q = v * (1 - f * s);
    t = v * (1 - (1 - f) * s);
    switch (i % 6) {
        case 0: r = v, g = t, b = p; break;
        case 1: r = q, g = v, b = p; break;
        case 2: r = p, g = v, b = t; break;
        case 3: r = p, g = q, b = v; break;
        case 4: r = t, g = p, b = v; break;
        case 5: r = v, g = p, b = q; break;
    }
    return [r, g, b]
}

function myDot(col1, col2){
    let dd = Math.sqrt(col1[0]*col1[0]+col1[1]*col1[1]+col1[2]*col1[2]);
    let r = col1[0]/dd;
    let g = col1[1]/dd;
    let b = col1[2]/dd;
    let dd2 = Math.sqrt(col2[0]*col2[0]+col2[1]*col2[1]+col2[2]*col2[2]);
    let r2 = col2[0]/dd2;
    let g2 = col2[1]/dd2;
    let b2 = col2[2]/dd2;
    return r*r2 + g*g2 + b*b2;
}

function windowResized() {
    if(renderer){

        var ww = window.innerWidth || canvas.clientWidth || body.clientWidth;
        var wh = window.innerHeight|| canvas.clientHeight|| body.clientHeight;

        baseWidth = ress-33;
        baseHeight = ress-33;

        canvasWidth = ress;
        canvasHeight = ress;

        if(ww < ress+16 || wh < ress+16 || true){
            var mm = min(ww, wh);
            canvasWidth = mm-10*mm/ress;
            canvasHeight = mm-10*mm/ress;
            //baseWidth = mm-16-16;
            //baseHeight = mm-16-16;
        }

        winScale = canvasWidth / ress;
        camera.left = -canvasWidth/2 / winScale;
        camera.right = +canvasWidth/2 / winScale;
        camera.top = +canvasHeight/2 / winScale;
        camera.bottom = -canvasHeight/2 / winScale;
        camera.updateProjectionMatrix();

        renderer.setPixelRatio( window.devicePixelRatio );
        //renderer.setPixelRatio( 1.0000 );
        renderer.setSize( canvasWidth, canvasHeight );
    
        renderer.domElement.id = "cnvs";
        //renderer.domElement.style.position = "absolute";
        //renderer.domElement.style.left = "0px";
        //renderer.domElement.style.top = "0px";
        repositionCanvas(renderer.domElement);

        composer = new EffectComposer( renderer );
        renderPass = new RenderPass( scene, camera );
        PostProcShader.uniforms.resolution.value = [canvasWidth*window.devicePixelRatio, canvasHeight*window.devicePixelRatio];
        postProcPass = new ShaderPass( PostProcShader );
        composer.addPass( renderPass );
        composer.addPass( postProcPass );
        composer.render();
        //renderer.render( scene, camera );
    }
    else{
        reset();
    }
}  

function mouseClicked(){
    //reset();
}

function onDocumentMouseMove(event) {
    event.preventDefault();
    mouseprev.x = mouse.x;
    mouseprev.y = mouse.y;
    mouse.x = event.clientX;
    mouse.y = event.clientY;

    var mx = event.clientX - (window.innerWidth - canvasWidth)/2;
    var my = event.clientY - (window.innerHeight - canvasHeight)/2;
    var rx = mx*winScale;
    var ry = my*winScale;
    
    if(ptsss)
        ptsss.material.uniforms.u_time.value = ry/55.;
}


function scroll(event) {
    //event.preventDefault();
    //scrollscale = scrollscale + event.deltaY * -0.002;
    //scrollscale = Math.min(Math.max(.125, scrollscale), 6);
  }
  
  
window.onresize = windowResized;
window.onresize = windowResized;
window.onclick = mouseClicked;
window.onwheel = scroll;

window.onmousemove = onDocumentMouseMove;

var paletteImg = new Image();
paletteImg.src = './assets/colorPalette2.png';
paletteImg.onload = function () {
    paletteCanvas = document.createElement('canvas');
    paletteCanvas.width = paletteImg.width;
    paletteCanvas.height = paletteImg.height;
    paletteCanvas.getContext('2d').drawImage(paletteImg, 0, 0, paletteImg.width, paletteImg.height);
    reset();
}

const PERLIN_YWRAPB = 4;
const PERLIN_YWRAP = 1 << PERLIN_YWRAPB;
const PERLIN_ZWRAPB = 8;
const PERLIN_ZWRAP = 1 << PERLIN_ZWRAPB;
const PERLIN_SIZE = 4095;

let perlin_octaves = 4; 
let perlin_amp_falloff = 0.5; 

const scaled_cosine = i => 0.5 * (1.0 - Math.cos(i * Math.PI));
let perlin;


var noise = function(x, y = 0, z = 0) {
  if (perlin == null) {
    perlin = new Array(PERLIN_SIZE + 1);
    for (let i = 0; i < PERLIN_SIZE + 1; i++) {
      perlin[i] = fxrand();
    }
  }

  if (x < 0) {
    x = -x;
  }
  if (y < 0) {
    y = -y;
  }
  if (z < 0) {
    z = -z;
  }

  let xi = Math.floor(x),
    yi = Math.floor(y),
    zi = Math.floor(z);
  let xf = x - xi;
  let yf = y - yi;
  let zf = z - zi;
  let rxf, ryf;

  let r = 0;
  let ampl = 0.5;

  let n1, n2, n3;

  for (let o = 0; o < perlin_octaves; o++) {
    let of = xi + (yi << PERLIN_YWRAPB) + (zi << PERLIN_ZWRAPB);

    rxf = scaled_cosine(xf);
    ryf = scaled_cosine(yf);

    n1 = perlin[of & PERLIN_SIZE];
    n1 += rxf * (perlin[(of + 1) & PERLIN_SIZE] - n1);
    n2 = perlin[(of + PERLIN_YWRAP) & PERLIN_SIZE];
    n2 += rxf * (perlin[(of + PERLIN_YWRAP + 1) & PERLIN_SIZE] - n2);
    n1 += ryf * (n2 - n1);

    of += PERLIN_ZWRAP;
    n2 = perlin[of & PERLIN_SIZE];
    n2 += rxf * (perlin[(of + 1) & PERLIN_SIZE] - n2);
    n3 = perlin[(of + PERLIN_YWRAP) & PERLIN_SIZE];
    n3 += rxf * (perlin[(of + PERLIN_YWRAP + 1) & PERLIN_SIZE] - n3);
    n2 += ryf * (n3 - n2);

    n1 += scaled_cosine(zf) * (n2 - n1);

    r += n1 * ampl;
    ampl *= perlin_amp_falloff;
    xi <<= 1;
    xf *= 2;
    yi <<= 1;
    yf *= 2;
    zi <<= 1;
    zf *= 2;

    if (xf >= 1.0) {
      xi++;
      xf--;
    }
    if (yf >= 1.0) {
      yi++;
      yf--;
    }
    if (zf >= 1.0) {
      zi++;
      zf--;
    }
  }
  return r;
};

var noiseDetail = function(lod, falloff) {
  if (lod > 0) {
    perlin_octaves = lod;
  }
  if (falloff > 0) {
    perlin_amp_falloff = falloff;
  }
};

var noiseSeed = function(seed) {
  const lcg = (() => {
    const m = 4294967296;
    const a = 1664525;
    const c = 1013904223;
    let seed, z;
    return {
      setSeed(val) {
        z = seed = (val == null ? fxrand() * m : val) >>> 0;
      },
      getSeed() {
        return seed;
      },
      rand() {
        z = (a * z + c) % m;
        return z / m;
      }
    };
  })();

  lcg.setSeed(seed);
  perlin = new Array(PERLIN_SIZE + 1);
  for (let i = 0; i < PERLIN_SIZE + 1; i++) {
    perlin[i] = lcg.rand();
  }
};