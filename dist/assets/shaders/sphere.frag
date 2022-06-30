varying vec3 vUv;


uniform vec4 pl1;
uniform vec4 pl2;

float power(float p, float g) {
    if (p < 0.5)
        return 0.5 * pow(2.*p, g);
    else
        return 1. - 0.5 * pow(2.*(1. - p), g);
}

float randomNoise(vec2 p) {
  return fract(16791.414*sin(7.*p.x+p.y*73.41))*2.-1.;
}

void main() {
    vec3 vv = vUv / length(vUv);

    float r1 = randomNoise(vv.xy);
    float r2 = randomNoise(vv.xy+.313);
    float r3 = randomNoise(vv.xy+.513);
    
    vec3 frontNoised_1 = pl1.xyz + vec3(r1, r2, r3)*.03;
    frontNoised_1 = frontNoised_1 / length(frontNoised_1);
    float crn_1 = min(max(0.0, dot(vv, frontNoised_1)), 1.);
    crn_1 = pow(crn_1, pl1.w);
    vec4 res_1 = vec4(crn_1, crn_1, crn_1, 1.0);
    
    vec3 frontNoised_2 = pl2.xyz + vec3(r1, r2, r3)*.03;
    frontNoised_2 = frontNoised_2 / length(frontNoised_2);
    float crn_2 = min(max(0.0, dot(vv, frontNoised_2)), 1.);
    crn_2 = pow(crn_2, pl2.w);
    vec4 res_2 = vec4(crn_2, crn_2, crn_2, 1.0);

    vec4 res = 1. - (1.-res_1) * (1.-res_2);

    gl_FragColor = mix(res, vec4(0., 0.5, .8, 1.), .1);
}