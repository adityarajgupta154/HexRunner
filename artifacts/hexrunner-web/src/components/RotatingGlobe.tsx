import { useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '../hooks/use-prefers-reduced-motion';

const vertexShaderSource = `
  attribute vec2 aPosition;
  varying vec2 vUv;

  void main() {
    vUv = aPosition * 0.5 + 0.5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
  }
`;

const fragmentShaderSource = `
  precision highp float;

  varying vec2 vUv;
  uniform sampler2D uTexture;
  uniform float uRotation;

  const float PI = 3.141592653589793;

  void main() {
    vec2 point = vUv * 2.0 - 1.0;
    point.y *= -1.0;
    float radiusSquared = dot(point, point);

    if (radiusSquared > 1.0) {
      discard;
    }

    float depth = sqrt(1.0 - radiusSquared);
    vec3 normal = normalize(vec3(point.x, point.y, depth));
    float cosine = cos(uRotation);
    float sine = sin(uRotation);
    vec3 rotatedNormal = vec3(
      cosine * normal.x + sine * normal.z,
      normal.y,
      -sine * normal.x + cosine * normal.z
    );

    float longitude = atan(rotatedNormal.x, rotatedNormal.z) / (2.0 * PI) + 0.5;
    float latitude = asin(clamp(rotatedNormal.y, -1.0, 1.0)) / PI + 0.5;
    vec3 earth = texture2D(uTexture, vec2(fract(longitude), latitude)).rgb;

    vec3 lightDirection = normalize(vec3(-0.4, 0.35, 1.0));
    float diffuse = 0.28 + 0.72 * max(dot(normal, lightDirection), 0.0);
    float rim = pow(1.0 - max(normal.z, 0.0), 2.4);
    vec3 atmosphere = vec3(0.0, 0.72, 0.82) * rim * 0.7;
    vec3 color = earth * diffuse + atmosphere;
    float alpha = smoothstep(1.0, 0.965, sqrt(radiusSquared));

    gl_FragColor = vec4(color, alpha);
  }
`;

export function RotatingGlobe() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduceMotion = usePrefersReducedMotion();
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });

    if (!gl) {
      setFallback(true);
      return;
    }

    const createShader = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
    };

    const vertexShader = createShader(gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = createShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
    const program = gl.createProgram();

    if (!vertexShader || !fragmentShader || !program) {
      setFallback(true);
      return;
    }

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      setFallback(true);
      return;
    }

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );

    gl.useProgram(program);
    const position = gl.getAttribLocation(program, 'aPosition');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const rotationLocation = gl.getUniformLocation(program, 'uRotation');
    const image = new Image();
    let frame = 0;
    let disposed = false;

    const resize = () => {
      const size = canvas.getBoundingClientRect().width;
      const pixelRatio = Math.min(window.devicePixelRatio, 1.75);
      canvas.width = Math.max(1, Math.round(size * pixelRatio));
      canvas.height = Math.max(1, Math.round(size * pixelRatio));
      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    const render = (time: number) => {
      if (disposed) return;
      resize();
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(rotationLocation, reduceMotion ? 0.35 : time * 0.00012);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      if (!reduceMotion) {
        frame = requestAnimationFrame(render);
      }
    };

    image.onload = () => {
      if (disposed) return;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      frame = requestAnimationFrame(render);
    };
    image.onerror = () => setFallback(true);
    image.src = `${import.meta.env.BASE_URL}images/earth-night.png`;

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      gl.deleteTexture(texture);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
    };
  }, [reduceMotion]);

  if (fallback) {
    return (
      <img
        src={`${import.meta.env.BASE_URL}images/earth-night.png`}
        alt=""
        className="h-full w-full object-contain opacity-70"
      />
    );
  }

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="h-full w-full"
    />
  );
}