attribute vec4 color;
attribute vec2 size;
attribute vec3 axis;
attribute float angle;
attribute float index;

varying vec4 vColor;
varying vec2 vSize;
varying float vAngle;
varying float vIndex;

uniform float u_time;
uniform float u_scrollscale;
uniform float u_winscale;

void main() {
    //vAlpha = alpha;

    vec3 position2 = position;
    float ang = u_time*0.06*index/2400. + index*.01;

    position2.x = cos(ang)*position.x - sin(ang)*position.y;
    position2.y = sin(ang)*position.x + cos(ang)*position.y;
    vec3 poa = axis + vec3(position2.xy, 0.0)*size.x/2.;

    vec4 mvPosition = projectionMatrix * modelViewMatrix * vec4( poa, 1.0 );


    gl_PointSize = size.x*u_winscale;
    gl_Position = mvPosition;

    // drawing animation
    //if(index/2250. > u_time)
    //    gl_PointSize = 0.;

    vColor = color;
    vSize = size;
    vAngle = angle;
    vIndex = index;
}