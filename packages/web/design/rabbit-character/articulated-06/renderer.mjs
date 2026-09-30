import {deformPart} from './skinning.mjs';

const VERTEX=`attribute vec2 position;attribute vec2 uv;varying vec2 tex;varying vec2 local;
void main(){tex=uv;local=position;gl_Position=vec4(position.x/256.-1.,1.-position.y/256.,0.,1.);}`;
const FRAGMENT=`precision highp float;uniform sampler2D image;uniform bool support;
uniform bool grayscale;varying vec2 tex;varying vec2 local;
float bayer(vec2 p){
  vec2 a=mod(p,2.);vec2 b=mod(floor(p/2.),2.);
  float low=2.*a.x+3.*a.y-4.*a.x*a.y;
  float high=2.*b.x+3.*b.y-4.*b.x*b.y;
  return (4.*low+high+.5)/16.;
}
void main(){
  vec4 rgba=texture2D(image,tex);if(rgba.a<.01)discard;
  if(support&&local.y>480.)discard;
  float lum=dot(rgba.rgb,vec3(.299,.587,.114));
  float coverage=pow(clamp((.88-lum)/.63,0.,1.),1.3);
  vec2 source=tex*512.;
  if(coverage>.03&&source.x>120.&&source.x<324.&&source.y<284.)coverage=coverage*1.45+.1;
  if(coverage>.02&&source.x>144.&&source.x<274.&&source.y>206.&&source.y<272.)coverage=coverage*1.35+.08;
  if(coverage>.02&&source.y>424.)coverage=coverage*1.7+.1;
  float ink=grayscale?clamp(coverage,0.,1.):step(bayer(floor(source/2.)),coverage);
  // White fur remains an opaque surface here, hiding far-side material. Only
  // the final pass makes negative-space paper transparent.
  gl_FragColor=vec4(vec3(ink),rgba.a);
}`;
const FINAL_VERTEX=`attribute vec2 position;varying vec2 tex;void main(){tex=(position+1.)/2.;gl_Position=vec4(position,0.,1.);}`;
const FINAL_FRAGMENT=`precision mediump float;uniform sampler2D image;varying vec2 tex;
void main(){float coverage=texture2D(image,tex).r;gl_FragColor=vec4(vec3(10./255.)*coverage,coverage);}`;

function program(gl,vs,fs){
  const build=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
  const p=gl.createProgram();gl.attachShader(p,build(gl.VERTEX_SHADER,vs));gl.attachShader(p,build(gl.FRAGMENT_SHADER,fs));
  gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));return p;
}
function texture(gl){
  const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  return tex;
}

export class RabbitRenderer {
  static async create(rig,baseURL,options={}){
    const renderer=new RabbitRenderer(rig,options);
    const gl=renderer.gl;
    for(const part of rig.parts){
      const image=new Image();image.src=new URL(part.texture,baseURL).href;await image.decode();
      const tex=texture(gl);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
      const indices=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,indices);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(part.triangles),gl.STATIC_DRAW);
      const buffer=gl.createBuffer();
      renderer.parts.push({part,tex,indices,buffer,data:new Float32Array(part.vertices.length*4)});
    }
    return renderer;
  }
  constructor(rig,{deform=deformPart}={}){
    this.rig=rig;this.deform=deform;this.parts=[];this.canvas=document.createElement('canvas');this.canvas.width=this.canvas.height=512;
    const gl=this.canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:true,preserveDrawingBuffer:true});
    if(!gl)throw Error('WebGL unavailable; continuous renderer cannot be validated');this.gl=gl;
    this.skin=program(gl,VERTEX,FRAGMENT);this.final=program(gl,FINAL_VERTEX,FINAL_FRAGMENT);
    this.surface=texture(gl);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,512,512,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
    this.framebuffer=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,this.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,this.surface,0);
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Incomplete skin surface');
    this.quad=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.quad);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
    this.drawOrder=rig.draw_order||['left_leg','right_leg','left_arm','tail','pelvis','torso_coat','left_ear','right_ear','head','watch','watch_bow','right_arm'];
  }
  render(pose,{grayscale=false,only=null}={}){
    const gl=this.gl;gl.viewport(0,0,512,512);gl.bindFramebuffer(gl.FRAMEBUFFER,this.framebuffer);
    gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.skin);gl.uniform1i(gl.getUniformLocation(this.skin,'grayscale'),grayscale);
    const position=gl.getAttribLocation(this.skin,'position'),uv=gl.getAttribLocation(this.skin,'uv');
    gl.enableVertexAttribArray(position);gl.enableVertexAttribArray(uv);this.deformed={};
    for(const name of this.drawOrder){
      if(only&&!only.includes(name))continue;
      const resource=this.parts.find(r=>r.part.name===name),{part,tex,indices,buffer,data}=resource;
      const points=this.deform(part,pose,this.rig);this.deformed[name]=points;
      for(let i=0;i<points.length;i++)data.set([...points[i],...part.vertices[i].uv],i*4);
      gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW);
      gl.vertexAttribPointer(position,2,gl.FLOAT,false,16,0);gl.vertexAttribPointer(uv,2,gl.FLOAT,false,16,8);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,indices);gl.bindTexture(gl.TEXTURE_2D,tex);
      gl.uniform1i(gl.getUniformLocation(this.skin,'support'),(name.endsWith('_leg')||part.kind==='leg-section'||part.kind==='joint-skin')&&pose.legs[name.split('_')[0]].support);
      gl.drawElements(gl.TRIANGLES,part.triangles.length,gl.UNSIGNED_SHORT,0);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.disable(gl.BLEND);gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(this.final);
    gl.disableVertexAttribArray(uv);gl.bindBuffer(gl.ARRAY_BUFFER,this.quad);
    const pos=gl.getAttribLocation(this.final,'position');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
    gl.bindTexture(gl.TEXTURE_2D,this.surface);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
    return this.canvas;
  }
  dispose(){
    const gl=this.gl;
    for(const p of this.parts){gl.deleteTexture(p.tex);gl.deleteBuffer(p.indices);gl.deleteBuffer(p.buffer);}
    gl.deleteTexture(this.surface);gl.deleteFramebuffer(this.framebuffer);gl.deleteBuffer(this.quad);
    gl.deleteProgram(this.skin);gl.deleteProgram(this.final);
  }
}
