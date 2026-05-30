import { useEffect, useRef } from "react";
import { Color, Mesh, Program, Renderer, Triangle, Vec2 } from "ogl";

const vertex = `
  attribute vec2 uv;
  attribute vec2 position;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const fragment = `
  precision highp float;

  uniform float uTime;
  uniform vec2 uMouse;
  uniform vec2 uResolution;
  uniform vec3 uBaseColor;
  uniform vec3 uGlowColor;
  varying vec2 vUv;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));

    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 5; i++) {
      value += amp * noise(p);
      p = mat2(1.6, 1.2, -1.2, 1.6) * p;
      amp *= 0.5;
    }
    return value;
  }

  void main() {
    vec2 uv = vUv;
    vec2 p = uv - 0.5;
    p.x *= uResolution.x / max(uResolution.y, 1.0);

    float time = uTime * 0.12;
    float flow = fbm(p * 3.2 + vec2(time, -time * 0.7));
    float crossFlow = fbm(p * 5.4 + vec2(-time * 0.5, time));
    float contour = smoothstep(0.55, 0.05, abs(p.y + sin(p.x * 3.4 + flow * 2.5) * 0.08));
    float dataLine = smoothstep(0.018, 0.0, abs(fract((p.x + flow * 0.15 + time) * 6.0) - 0.5)) * 0.18;
    float mouseGlow = smoothstep(0.42, 0.0, distance(uv, uMouse)) * 0.24;

    vec3 base = uBaseColor * (0.85 + flow * 0.35);
    vec3 glow = uGlowColor * (contour * 0.55 + crossFlow * 0.22 + dataLine + mouseGlow);
    vec3 color = base + glow;

    float vignette = smoothstep(0.98, 0.28, length(p));
    color *= vignette;

    gl_FragColor = vec4(color, 0.92);
  }
`;

export default function InterstellarFluid({
  baseColor = [0.01, 0.04, 0.07],
  glowColor = [0.15, 0.9, 0.66],
  interactive = true,
  className = ""
}) {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const shouldReduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const renderer = new Renderer({
      alpha: true,
      antialias: false,
      dpr: shouldReduceMotion ? 1 : Math.min(window.devicePixelRatio || 1, 1.5)
    });
    const gl = renderer.gl;
    gl.canvas.setAttribute("aria-hidden", "true");
    gl.clearColor(0, 0, 0, 0);

    const geometry = new Triangle(gl);
    const program = new Program(gl, {
      vertex,
      fragment,
      uniforms: {
        uTime: { value: 0 },
        uMouse: { value: new Vec2(0.72, 0.32) },
        uResolution: { value: new Vec2(1, 1) },
        uBaseColor: { value: new Color(baseColor) },
        uGlowColor: { value: new Color(glowColor) }
      }
    });
    const mesh = new Mesh(gl, { geometry, program });

    function resize() {
      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);
      renderer.setSize(width, height);
      program.uniforms.uResolution.value.set(width, height);
    }

    function handlePointerMove(event) {
      const rect = container.getBoundingClientRect();
      const x = (event.clientX - rect.left) / Math.max(rect.width, 1);
      const y = 1 - (event.clientY - rect.top) / Math.max(rect.height, 1);
      program.uniforms.uMouse.value.set(x, y);
    }

    let frameId = 0;
    function update(time) {
      program.uniforms.uTime.value = time * 0.001;
      renderer.render({ scene: mesh });
      frameId = window.requestAnimationFrame(update);
    }

    container.appendChild(gl.canvas);
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    if (interactive) container.addEventListener("pointermove", handlePointerMove);
    if (!shouldReduceMotion) frameId = window.requestAnimationFrame(update);
    else renderer.render({ scene: mesh });

    return () => {
      window.cancelAnimationFrame(frameId);
      observer.disconnect();
      if (interactive) container.removeEventListener("pointermove", handlePointerMove);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      gl.canvas.remove();
    };
  }, [baseColor, glowColor, interactive]);

  return <div className={`interstellar-fluid ${className}`} ref={containerRef} />;
}
