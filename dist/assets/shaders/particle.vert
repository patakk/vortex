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
uniform float u_seed;
uniform vec2 u_resolution;
uniform float u_scrollscale;
uniform float u_winscale;

float randomNoise(vec2 p) {
  return fract(16791.414*sin(7.*p.x+p.y*73.41));
}

float random (in vec2 _st) {
    return fract(sin(dot(_st.xy,
                         vec2(12.9898,78.233)))*
        43758.5453123);
}

float noise (in vec2 _st) {
    vec2 i = floor(_st);
    vec2 f = fract(_st);

    // Four corners in 2D of a tile
    float a = random(i);
    float b = random(i + vec2(1.0, 0.0));
    float c = random(i + vec2(0.0, 1.0));
    float d = random(i + vec2(1.0, 1.0));

    vec2 u = f * f * (3.0 - 2.0 * f);

    return mix(a, b, u.x) +
            (c - a)* u.y * (1.0 - u.x) +
            (d - b) * u.x * u.y;
}

float noise3 (in vec2 _st, in float t) {
    vec2 i = floor(_st+t);
    vec2 f = fract(_st+t);

    // Four corners in 2D of a tile
    float a = random(i);
    float b = random(i + vec2(1.0, 0.0));
    float c = random(i + vec2(0.0, 1.0));
    float d = random(i + vec2(1.0, 1.0));

    vec2 u = f * f * (3.0 - 2.0 * f);

    return mix(a, b, u.x) +
            (c - a)* u.y * (1.0 - u.x) +
            (d - b) * u.x * u.y;
}

#define NUM_OCTAVES 5

float fbm ( in vec2 _st) {
    float v = 0.0;
    float a = 0.5;
    vec2 shift = vec2(100.0);
    // Rotate to reduce axial bias
    mat2 rot = mat2(cos(0.5), sin(0.5),
                    -sin(0.5), cos(0.50));
    for (int i = 0; i < NUM_OCTAVES; ++i) {
        v += a * noise(_st);
        _st = rot * _st * 2.0 + shift;
        a *= 0.5;
    }
    return v;
}

float fbm3 ( in vec2 _st, in float t) {
    float v = 0.0;
    float a = 0.5;
    vec2 shift = vec2(100.0);
    // Rotate to reduce axial bias
    mat2 rot = mat2(cos(0.5), sin(0.5),
                    -sin(0.5), cos(0.50));
    for (int i = 0; i < NUM_OCTAVES; ++i) {
        v += a * noise3(_st, t);
        _st = rot * _st * 2.0 + shift;
        a *= 0.5;
    }
    return v*2.-1.;
}


void main() {
    //vAlpha = alpha;

    vec3 position2 = position;
    float ang = 4.*sin(u_time*0.03+index*.01)*index/888. + index*(.01 + .02*randomNoise(vec2(u_seed)));

    vec3 axis2 = axis;
    axis2.x = fbm3(vec2(index,index)*.001+u_seed*3.13, u_seed+0.0+u_time*.01)*u_resolution.x * index/444./2./1.3;
    axis2.y = fbm3(vec2(index,index)*.001+u_seed*3.13, u_seed+10.0+u_time*.01)*u_resolution.x * index/444./2./1.3;

    position2.x = cos(ang)*position.x - sin(ang)*position.y;
    position2.y = sin(ang)*position.x + cos(ang)*position.y;
    vec3 poa = axis2 + vec3(position2.xy, 0.0)*size.x/2.;

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