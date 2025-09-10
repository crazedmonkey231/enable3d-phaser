export const PosterizeShader = {
  uniforms: {
    tDiffuse: { value: null },
    levels:   { value: 4.0 },  // color steps
    gamma:    { value: 1.0 }   // adjust if your scene looks washed
  },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float levels;
    uniform float gamma;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 g = pow(c.rgb, vec3(gamma));
      vec3 q = floor(g * levels) / levels;
      q = pow(q, vec3(1.0 / gamma));
      gl_FragColor = vec4(q, c.a);
    }
  `
}
