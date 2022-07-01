
varying vec4 vColor;
varying vec2 vSize;
varying float vAngle;
varying float vIndex;


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
    return v;
}


void main() {
    vec2 xyclip = 2.*(gl_PointCoord.xy - .5)*1.05;
    vec2 xyrot;
    xyrot.x = xyclip.x * cos(vAngle) - xyclip.y * sin(vAngle);
    xyrot.y = xyclip.x * sin(vAngle) + xyclip.y * cos(vAngle);


    float ratio = vSize.x/vSize.y;
    float ms = max(vSize.x, vSize.y);
    float mms = min(vSize.x, vSize.y);

    xyrot.y *= ms/vSize.y;
    xyrot.x *= ms/vSize.x;

    //float f2 = .2*(-.5 + fbm3(xyrot.xy*1., 10.310+mod(vIndex/100., 1.0)));
    //xyrot.x += f1;
    //xyrot.y += f2;

    //float f1 = 0.*.2*(-.5 + fbm3(xyrot.xy*1., 0.0+mod(vIndex/100., 1.0)));
    //float f2 = 0.*.2*(-.5 + fbm3(xyrot.xy*1., 13.31+mod(vIndex/100., 1.0)));

    //loat dist = length(xyclip + vec2(f1,f2));
    float dist = length(xyclip);
    float alpha = 1. - smoothstep(0.28, 0.99, dist);
    float rim = smoothstep(1.-1./vSize.x-.23, 1.-1./vSize.x, dist);

    vec3 res = vColor.rgb * (.6 + .4*vec3(xyclip.xy, 1.));

    res += rim*.9*pow(abs(xyclip.x), 3.);

    gl_FragColor = vec4( res, alpha);
}