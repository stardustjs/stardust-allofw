import { GL3 } from "allofw";
import { RuntimeError } from "stardust-core";

function getShaderInfoLog(shader: GL3.Shader) {
    let buffer = new Buffer(4);
    GL3.getShaderiv(shader, GL3.INFO_LOG_LENGTH, buffer);
    let length = buffer.readUInt32LE(0);
    if(length > 0) {
        let buf = new Buffer(length);
        GL3.getShaderInfoLog(shader, length, buffer, buf);
        return buf.toString("utf-8");
    }
};

function isShaderCompiled(shader: GL3.Shader) {
    let buffer = new Buffer(4);
    GL3.getShaderiv(shader, GL3.COMPILE_STATUS, buffer);
    let success = buffer.readUInt32LE(0);
    return success != 0;
};
function isProgramLinked(program: GL3.Program) {
    let buffer = new Buffer(4);
    GL3.getProgramiv(program, GL3.LINK_STATUS, buffer);
    let success = buffer.readUInt32LE(0);
    return success != 0;
};

function getProgramInfoLog(program: GL3.Program) {
    let buffer = new Buffer(4);
    GL3.getProgramiv(program, GL3.INFO_LOG_LENGTH, buffer);
    let length = buffer.readUInt32LE(0);
    if(length > 0) {
        let buf = new Buffer(length);
        GL3.getProgramInfoLog(program, length, buffer, buf);
        return buf.toString("utf-8");
    }
};

class ShaderException extends Error {
    public message: string;
    public name: string;

    constructor(type: string, message?: string) {
        super();
        this.message = "CompileShaders: " + type + ": " + message;
        this.name = "ShaderException";
    }
}

export function compileShaders(shaders: {
    vertex?: string;
    geometry?: string;
    fragment?: string;
}): GL3.Program {
    let shader_v: GL3.Shader, shader_f: GL3.Shader, shader_g: GL3.Shader;
    if(shaders.vertex) {
        shader_v = GL3.createShader(GL3.VERTEX_SHADER);
        GL3.shaderSource(shader_v, [shaders.vertex]);
        GL3.compileShader(shader_v);
        let log = getShaderInfoLog(shader_v);
        if(log && log.trim() != "") {
            console.log(log);
        }
        if(!isShaderCompiled(shader_v)) {
            throw new ShaderException("Vertex");
        }
    }
    if(shaders.fragment) {
        shader_f = GL3.createShader(GL3.FRAGMENT_SHADER);
        GL3.shaderSource(shader_f, [shaders.fragment]);
        GL3.compileShader(shader_f);
        let log = getShaderInfoLog(shader_f);
        if(log && log.trim() != "") {
            console.log(log);
        }
        if(!isShaderCompiled(shader_f)) {
            throw new ShaderException("Fragment");
        }
    }
    if(shaders.geometry) {
        shader_g = GL3.createShader(GL3.GEOMETRY_SHADER);
        GL3.shaderSource(shader_g, [shaders.geometry]);
        GL3.compileShader(shader_g);
        let log = getShaderInfoLog(shader_g);
        if(log && log.trim() != "") {
            console.log(log);
        }
        if(!isShaderCompiled(shader_g)) {
            throw new ShaderException("Geometry");
        }
    }

    let program = GL3.createProgram();

    if(shader_v) GL3.attachShader(program, shader_v);
    if(shader_f) GL3.attachShader(program, shader_f);
    if(shader_g) GL3.attachShader(program, shader_g);

    GL3.linkProgram(program);
    let log = getProgramInfoLog(program);
    if(log && log.trim() != "") {
        console.log(log);
    }
    if(!isProgramLinked(program)) {
        throw new ShaderException("Link");
    }
    return program;
};


export function checkGLErrors(prefix: string = "") {
    let error = GL3.getError();
    if(error != 0) {
        throw new Error("GLError at " + prefix + ": " + error);
    }
}