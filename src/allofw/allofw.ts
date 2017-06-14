import { Specification, Mark, Type, Binding, ShiftBinding, Platform, PlatformMark, PlatformMarkData, BindingType, TextureBinding } from "stardust-core";
import { flattenEmits } from "stardust-core";
import { Dictionary, timeTask } from "stardust-core";
import { Generator, GenerateMode, ViewType } from "./generator";
import { RuntimeError } from "stardust-core";
import { Pose } from "stardust-core";
import * as AllofwUtils from "./allofwutils";
import { GL3, OpenGLWindow, OmniStereo } from "allofw";

class AllofwPlatformMarkProgram {
    private _program: GL3.Program;
    private _uniformLocations: Dictionary<number>;
    private _attribLocations: Dictionary<number>;

    constructor(
        platform: AllofwPlatform3D,
        spec: Specification.Mark,
        shader: Specification.Shader,
        asUniform: (name: string) => boolean
    ) {
        let generator = new Generator(platform.getPrefixCode(), spec, shader, asUniform);
        let codes = {
            vertex: generator.getVertexCode(),
            geometry: generator.getGeometryCode(),
            fragment: generator.getFragmentCode()
        };
        // console.log(codes.vertex);
        // console.log(codes.geometry);
        // console.log(codes.fragment);
        this._program = AllofwUtils.compileShaders(codes);
        this._uniformLocations = new Dictionary<number>();
        this._attribLocations = new Dictionary<number>();
    }

    public use() {
        GL3.useProgram(this._program);
    }

    public id(): number {
        return this._program.id();
    }

    public setUniform(name: string, type: Type, value: number | number[]) {
        let location = this.getUniformLocation(name);
        if(location == null) return;
        if(type.primitive == "float") {
            let va = value as number[];
            switch(type.primitiveCount) {
                case 1: GL3.uniform1f(location, value as number); break;
                case 2: GL3.uniform2f(location, va[0], va[1]); break;
                case 3: GL3.uniform3f(location, va[0], va[1], va[2]); break;
                case 4: GL3.uniform4f(location, va[0], va[1], va[2], va[3]); break;
            }
        }
        if(type.primitive == "int") {
            let va = value as number[];
            switch(type.primitiveCount) {
                case 1: GL3.uniform1i(location, value as number); break;
                case 2: GL3.uniform2i(location, va[0], va[1]); break;
                case 3: GL3.uniform3i(location, va[0], va[1], va[2]); break;
                case 4: GL3.uniform4i(location, va[0], va[1], va[2], va[3]); break;
            }
        }
    }

    public getUniformLocation(name: string): number {
        if(this._uniformLocations.has(name)) {
            return this._uniformLocations.get(name);
        } else {
            let location = GL3.getUniformLocation(this._program, name);
            this._uniformLocations.set(name, location);
            return location;
        }
    }
    public getAttribLocation(name: string): number {
        if(this._attribLocations.has(name)) {
            return this._attribLocations.get(name);
        } else {
            let location = GL3.getAttribLocation(this._program, name);
            if(location < 0) location = null;
            this._attribLocations.set(name, location);
            return location;
        }
    }
}

export class AllofwPlatformMarkData extends PlatformMarkData {
    public buffers: Dictionary<GL3.Buffer>;
    public vertexArray: GL3.VertexArray;
    public ranges: [ number, number ][];
}

export class AllofwPlatformMark extends PlatformMark {
    private _mark: Mark;
    private _platform: AllofwPlatform3D;
    private _bindings: Dictionary<Binding>;
    private _shiftBindings: Dictionary<ShiftBinding>;
    private _spec: Specification.Mark;
    private _shader: Specification.Shader;

    private _program: AllofwPlatformMarkProgram;
    private _pickIndex: number;
    private _minOffset: number;
    private _maxOffset: number;

    constructor(
        platform: AllofwPlatform3D,
        mark: Mark,
        spec: Specification.Mark,
        shader: Specification.Shader,
        bindings: Dictionary<Binding>,
        shiftBindings: Dictionary<ShiftBinding>
    ) {
        super();
        this._platform = platform;
        this._mark = mark;
        this._bindings = bindings;
        this._shiftBindings = shiftBindings;
        this._spec = spec;
        this._shader = shader;

        this._program = new AllofwPlatformMarkProgram(
            this._platform,
            this._spec,
            this._shader,
            (name) => this.isUniform(name)
        );


        let minOffset = 0;
        let maxOffset = 0;
        this._shiftBindings.forEach((shift, name) => {
            if(shift.offset > maxOffset) maxOffset = shift.offset;
            if(shift.offset < minOffset) minOffset = shift.offset;
        });
        this._minOffset = minOffset;
        this._maxOffset = maxOffset;


        this.initializeUniforms();
    }
    public initializeUniforms() {
        for(let name in this._spec.input) {
            if(this.isUniform(name)) {
                this.updateUniform(name, this._bindings.get(name).specValue);
            }
        }
    }
    public initializeBuffers(): AllofwPlatformMarkData {
        let data = new AllofwPlatformMarkData();
        data.vertexArray = new GL3.VertexArray();
        data.buffers = new Dictionary<GL3.Buffer>();;
        this._bindings.forEach((binding, name) => {
            if(!this.isUniform(name)) {
                let location = this._program.getAttribLocation(name);
                if(location != null) {
                    data.buffers.set(name, new GL3.Buffer());
                }
            }
        });
        let spec = this._spec;
        let program = this._program;
        let bindings = this._bindings;
        let minOffset = this._minOffset;
        let maxOffset = this._maxOffset;

        GL3.bindVertexArray(data.vertexArray);
        // Assign attributes to buffers
        for(let name in spec.input) {
            let attributeLocation = program.getAttribLocation(name);
            if(attributeLocation == null) continue;
            if(this._shiftBindings.has(name)) {
                let shift = this._shiftBindings.get(name);
                GL3.bindBuffer(GL3.ARRAY_BUFFER, data.buffers.get(shift.name));
                GL3.enableVertexAttribArray(attributeLocation);
                let type = bindings.get(shift.name).valueType;
                GL3.vertexAttribPointer(attributeLocation,
                    type.primitiveCount, type.primitive == "float" ? GL3.FLOAT : GL3.INT,
                    GL3.FALSE, 0, type.size * (shift.offset - minOffset)
                );
            } else {
                GL3.bindBuffer(GL3.ARRAY_BUFFER, data.buffers.get(name));
                GL3.enableVertexAttribArray(attributeLocation);
                let type = bindings.get(name).valueType;
                GL3.vertexAttribPointer(attributeLocation,
                    type.primitiveCount, type.primitive == "float" ? GL3.FLOAT : GL3.INT,
                    GL3.FALSE, 0, type.size * (-minOffset)
                );
            }
        }
        GL3.bindVertexArray(0);
        data.ranges = [];
        return data;
    }
    // Is the input attribute compiled as uniform?
    public isUniform(name: string): boolean {
        // Extra variables we add are always not uniforms.
        if(this._bindings.get(name) == null) {
            if(this._shiftBindings.get(name) == null) {
                throw new RuntimeError(`attribute ${name} is not specified.`);
            } else {
                return this._bindings.get(this._shiftBindings.get(name).name).bindingType != BindingType.FUNCTION;
            }
        } else {
            // Look at the binding to determine.
            return this._bindings.get(name).bindingType != BindingType.FUNCTION;
        }
    }
    public updateUniform(name: string, value: Specification.Value): void {
        let binding = this._bindings.get(name);
        let type = binding.valueType;
        this._program.use();
        this._program.setUniform(name, type, value);
    }
    public updateTexture(name: string, value: TextureBinding): void {
    }
    public uploadData(datas: any[][]): PlatformMarkData {
        let buffers = this.initializeBuffers();
        buffers.ranges = [];

        let repeatBegin = this._spec.repeatBegin || 0;
        let repeatEnd = this._spec.repeatEnd || 0;

        let bindings = this._bindings;

        let totalCount = 0;
        datas.forEach((data) => {
            let n = data.length;
            if(n == 0) {
                buffers.ranges.push(null);
                return;
            } else {
                let c1 = totalCount;
                totalCount += n + repeatBegin + repeatEnd;
                let c2 = totalCount;
                buffers.ranges.push([ c1, c2 ]);
            }
        });

        this._bindings.forEach((binding, name) => {
            let buffer = buffers.buffers.get(name);
            if(buffer == null) return;

            let type = binding.valueType;
            let array = new Float32Array(type.primitiveCount * totalCount);
            let currentIndex = 0;
            let multiplier = type.primitiveCount;

            datas.forEach((data) => {
                if(data.length == 0) return;
                for(let i = 0; i < repeatBegin; i++) {
                    binding.fillBinary([ data[0] ], 1, array.subarray(currentIndex, currentIndex + multiplier));
                    currentIndex += multiplier;
                }
                binding.fillBinary(data, 1, array.subarray(currentIndex, currentIndex + data.length * multiplier));
                currentIndex += data.length * multiplier;
                for(let i = 0; i < repeatEnd; i++) {
                    binding.fillBinary([ data[data.length - 1] ], 1, array.subarray(currentIndex, currentIndex + multiplier));
                    currentIndex += multiplier;
                }
            });

            GL3.bindBuffer(GL3.ARRAY_BUFFER, buffer);
            GL3.bufferData(GL3.ARRAY_BUFFER, array.byteLength, array, GL3.STATIC_DRAW);
        });
        return buffers;
    }

    // Render the graphics.
    public renderBase(buffers: AllofwPlatformMarkData, onRender: (i: number) => void): void {
        if(buffers.ranges.length > 0) {
            let spec = this._spec;
            let bindings = this._bindings;

            // Decide which program to use
            let program = this._program;

            program.use();

            GL3.bindVertexArray(buffers.vertexArray);
            this._platform.omnistereo.setUniforms(program.id());

            // Draw arrays
            buffers.ranges.forEach((range, index) => {
                if(onRender) {
                    onRender(index);
                }
                if(range != null) {
                    program.use();
                    GL3.drawArrays(GL3.POINTS, range[0], range[1] - range[0] - (this._maxOffset - this._minOffset));
                }
            });

            GL3.bindVertexArray(0);
        }
    }

    public render(buffers: PlatformMarkData, onRender: (i: number) => void) {
        this.renderBase(buffers as AllofwPlatformMarkData, onRender);
    }
}

export interface WebGLViewInfo {
    type: ViewType,
    width?: number;
    height?: number;
    fovY?: number;
    aspectRatio?: number;
    near?: number;
    far?: number;
}

export class AllofwPlatform3D extends Platform {
    protected _GL: WebGLRenderingContext;
    protected _viewInfo: WebGLViewInfo;
    protected _pose: Pose;
    protected _renderMode: GenerateMode;
    protected _window: OpenGLWindow;
    protected _omnistereo: OmniStereo;

    constructor(window: OpenGLWindow, omnistereo: OmniStereo) {
        super();
        this._window = window;
        this._omnistereo = omnistereo;
    }

    public get omnistereo(): OmniStereo {
        return this._omnistereo;
    }

    public getPrefixCode(): string {
        return this._omnistereo.getShaderCode();
    }

    public compile(mark: Mark, spec: Specification.Mark, shader: Specification.Shader, bindings: Dictionary<Binding>, shiftBindings: Dictionary<ShiftBinding>): PlatformMark {
        return new AllofwPlatformMark(this, mark, spec, shader, bindings, shiftBindings);
    }
}