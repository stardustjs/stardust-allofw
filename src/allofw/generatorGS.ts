import { convertTypeName, convertConstant } from "./types";
import { ShaderGenerator, ProgramGenerator } from "../glsl/glsl";
import { Specification } from "stardust-core";
import { Binding } from "stardust-core";
import { Dictionary } from "stardust-core";
import { flattenEmits } from "stardust-core";

export enum GenerateMode {
    NORMAL   = 0,
    PICK     = 1,
}

export enum ViewType {
    VIEW_2D = 0,
    VIEW_3D = 1
}

export class GLSLGeometryShaderGenerator extends ShaderGenerator {
    private _parent: Generator;

    constructor(parent: Generator) {
        super();
        this._parent = parent;
    }

    public addEmitStatement(sEmit: Specification.StatementEmit) {
        for(let name in sEmit.attributes) {
            this.addLine(`${this._parent._goutMapping.get(name)} = ${this.generateExpression(sEmit.attributes[name])};`);
        }
        let position = this._parent._goutMapping.get("position");
        switch(this._parent._spec.output["position"].type) {
            case "Vector2": {
                this.addLine(`gl_Position = s3_render_vertex(vec3(${position}, 0.0));`);
            } break;
            case "Vector3": {
                this.addLine(`gl_Position = s3_render_vertex(${position});`);
            } break;
            case "Vector4": {
                this.addLine(`gl_Position = s3_render_vertex(${position}.xyz);`);
            } break;
        }
        this.addLine("EmitVertex();");
        this.addLine("s3_emit_count += 1;");
        this.addLine("if(s3_emit_count % 3 == 0) EndPrimitive();");
    }
}

export class GLSLFragmentShaderGenerator extends ShaderGenerator {
    private _parent: Generator;

    constructor(parent: Generator) {
        super();
        this._parent = parent;
    }

    public addEmitStatement(sEmit: Specification.StatementEmit) {
        this.addLine(`${this._parent._fragmentOutputName} = ${this.generateExpression(sEmit.attributes["color"])};`);
    }
}

export class Generator extends ProgramGenerator {
    public _vertex: ShaderGenerator;
    public _geometry: GLSLGeometryShaderGenerator;
    public _fragment: GLSLFragmentShaderGenerator;

    public _vertexCode: string;
    public _geometryCode: string;
    public _fragmentCode: string;

    public _currentIndent: string;
    public _hasColor: boolean;
    public _hasNormal: boolean;
    public _positionType: string;

    constructor(prefixCode: string, spec: Specification.Mark, shader: Specification.Shader, asUniform: (name: string) => boolean) {
        super(spec, shader, asUniform);

        this._vertex = new ShaderGenerator();
        this._geometry = new GLSLGeometryShaderGenerator(this);
        this._fragment = new GLSLFragmentShaderGenerator(this);

        this._geometry.addAdditionalCode(prefixCode);

        this.compile();
    }

    public _voutMapping: Dictionary<string>;
    public _goutMapping: Dictionary<string>;
    public _foutMapping: Dictionary<string>;
    public _fragmentOutputName: string;

    public compile() {
        let spec = this._spec;
        let shader = this._shader;
        let asUniform = this._asUniform;

        this._voutMapping = new Dictionary<string>();
        this._goutMapping = new Dictionary<string>();

        this._vertex.addLine("#version 330");
        this._geometry.addLine("#version 330");
        this._fragment.addLine("#version 330");

        this._geometry.addLine("layout(points) in;");
        let maxVertices = flattenEmits(spec).count;
        this._geometry.addLine(`layout(triangle_strip, max_vertices = ${maxVertices}) out;`);

        // Input attributes
        for(let name in spec.input) {
            if(spec.input.hasOwnProperty(name)) {
                if(asUniform(name)) {
                    this._geometry.addDeclaration(name, spec.input[name].type, "uniform");
                } else {
                    this._vertex.addDeclaration(name, spec.input[name].type, "in");
                    let vname = this.getUnusedName(name);
                    this._voutMapping.set(name, vname);
                    this._vertex.addDeclaration(vname, spec.input[name].type, "out");
                    this._geometry.addArrayDeclaration(vname, spec.input[name].type, 1, "in");
                }
            }
        }
        // Output attributes
        for(let name in spec.output) {
            if(spec.output.hasOwnProperty(name)) {
                let oname = this.getUnusedName(name);
                this._goutMapping.set(name, oname);
                this._geometry.addDeclaration(oname, spec.output[name].type, "out");
            }
        }

        // Fragment shader inputs
        let fragment_passthrus: [string, string][] = []; // gname, input_name
        for(let name in shader.input) {
            if(shader.input.hasOwnProperty(name)) {
                if(this.fragmentPassthru(name)) {
                    let gname = this.getUnusedName(name);
                    fragment_passthrus.push([ gname, name ]);
                    this._geometry.addDeclaration(gname, shader.input[name].type, "out");
                    this._fragment.addDeclaration(gname, shader.input[name].type, "in");
                } else {
                    let gname = this._goutMapping.get(name);
                    this._fragment.addDeclaration(gname, shader.input[name].type, "in");
                }
            }
        }

        this._geometry.addAdditionalCode(`
            vec4 s3_render_vertex(vec3 p) {
                return omni_render(omni_transform(p));
            }
        `)
        this._geometry.addLine("@additionalCode");

        // The vertex shader.
        this._vertex.addLine("void main() {");
        this._vertex.indent();
        for(let name in spec.input) {
            if(spec.input.hasOwnProperty(name)) {
                if(!asUniform(name)) {
                    this._vertex.addLine(`${this._voutMapping.get(name)} = ${name};`);
                }
            }
        }
        this._vertex.unindent();
        this._vertex.addLine("}");

        // The geometry shader.
        this._geometry.addLine("void main() {");
        this._geometry.indent();
        this._geometry.addLine("int s3_emit_count = 0;");
        for(let name in spec.input) {
            if(spec.input.hasOwnProperty(name)) {
                if(!asUniform(name)) {
                    this._geometry.addDeclaration(name, spec.input[name].type);
                    this._geometry.addLine(`${name} = ${this._voutMapping.get(name)}[0];`);
                }
            }
        }
        // Define arguments.
        for(let name in spec.variables) {
            if(spec.variables.hasOwnProperty(name)) {
                let type = spec.variables[name];
                this._geometry.addDeclaration(name, type);
            }
        }
        fragment_passthrus.forEach(([gname, name]) => {
            this._geometry.addLine(`${gname} = ${name};`);
        });
        this._geometry.addStatements(spec.statements);
        this._geometry.unindent();
        this._geometry.addLine("}");

        // The fragment shader
        this._fragmentOutputName = this.getUnusedName("fragmentColor");
        this._fragment.addLine(`layout(location = 0) out vec4 ${this._fragmentOutputName};`);
        this._fragment.addLine("void main() {");
        this._fragment.indent();
        for(let name in shader.input) {
            if(shader.input.hasOwnProperty(name)) {
                if(this.fragmentPassthru(name)) {
                    fragment_passthrus.forEach(([gname, vname]) => {
                        if(vname == name) {
                            this._fragment.addLine(`${name} = ${gname};`);
                        }
                    });
                } else {
                    this._fragment.addDeclaration(name, shader.input[name].type);
                    this._fragment.addLine(`${name} = ${this._goutMapping.get(name)};`);
                }
            }
        }
        for(let name in shader.variables) {
            if(shader.variables.hasOwnProperty(name)) {
                let type = shader.variables[name];
                this._fragment.addDeclaration(name, type);
            }
        }
        this._fragment.addStatements(shader.statements);
        this._fragment.unindent();
        this._fragment.addLine("}");
    }

    public getVertexCode(): string {
        return this._vertex.getCode();
    }

    public getGeometryCode(): string {
        return this._geometry.getCode();
    }

    public getFragmentCode(): string {
        return this._fragment.getCode();
    }
}