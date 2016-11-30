import { convertTypeName, convertConstant } from "./types";
import { generateIntrinsicFunction } from "./intrinsics";
import { Specification } from "stardust-core";
import { Binding } from "stardust-core";
import { Dictionary } from "stardust-core";

export enum GenerateMode {
    NORMAL   = 0,
    PICK     = 1,
}


export enum ViewType {
    VIEW_2D = 0,
    VIEW_3D = 1
}

class LinesGenerator {
    private _lines: string[];
    private _currentIndent: string;
    private _blocks: Dictionary<string>;

    constructor() {
        this._lines = [];
        this._currentIndent = "";
        this._blocks = new Dictionary<string>();
    }

    public addNamedBlock(name: string, code: string) {
        this._blocks.set(name, code);
    }

    public addLine(code: string) {
        this._lines.push(this._currentIndent + code);
    }

    public indent() {
        this._currentIndent += "    ";
    }

    public unindent() {
        this._currentIndent = this._currentIndent.slice(0, this._currentIndent.length - 4);
    }

    public getCode(): string {
        return this._lines.map((line) => {
            if(line[0] == "@" && this._blocks.has(line.substr(1))) {
                return this._blocks.get(line.substr(1));
            } else {
                return line;
            }
        }).join("\n");
    }

    public addDeclaration(name: string, type: string, modifier: string = null) {
        if(modifier == null) {
            this.addLine(`${convertTypeName(type)} ${name};`);
        } else {
            this.addLine(`${modifier} ${convertTypeName(type)} ${name};`);
        }
    }

    public addArrayDeclaration(name: string, type: string, count: number = 1, modifier: string = null) {
        if(modifier == "null") {
            this.addLine(`${convertTypeName(type)}[${count}] ${name};`);
        } else {
            this.addLine(`${modifier} ${convertTypeName(type)}[${count}] ${name};`);
        }
    }
}

export class Generator {
    private _prefixCode: string;
    private _additionalCodes: string[];
    private _vertexLines: LinesGenerator;
    private _geometryLines: LinesGenerator;
    private _currentIndent: string;
    private _hasColor: boolean;
    private _hasNormal: boolean;
    private _positionType: string;

    constructor(prefixCode: string) {
        this._prefixCode = prefixCode;
        this._vertexLines = new LinesGenerator();
        this._geometryLines = new LinesGenerator();
        this._additionalCodes = [];
        this._currentIndent = "";
        this._hasColor = false;
        this._hasNormal = false;
    }

    public addAdditionalCode(code: string) {
        if(this._additionalCodes.indexOf(code) < 0) {
            this._additionalCodes.push(code);
        }
    }

    public generateExpression(expr: Specification.Expression): string {
        switch(expr.type) {
            case "constant": {
                let eConstant = expr as Specification.ExpressionConstant;
                return convertConstant(eConstant.valueType, eConstant.value);
            }
            case "variable": {
                let eVariable = expr as Specification.ExpressionVariable;
                return eVariable.variableName;
            }
            case "function": {
                let eFunction = expr as Specification.ExpressionFunction;
                let args = eFunction.arguments.map((arg) => this.generateExpression(arg));
                let { code, additionalCode } = generateIntrinsicFunction(eFunction.functionName, args);
                if(additionalCode != null) {
                    this.addAdditionalCode(additionalCode);
                }
                return code;
            }
            case "field": {
                let eField = expr as Specification.ExpressionField;
                return `${this.generateExpression(eField.value)}.${eField.fieldName}`;
            }
        }
    }

    public addStatement(stat: Specification.Statement) {
        switch(stat.type) {
            case "assign": {
                let sAssign = stat as Specification.StatementAssign;
                let expr = this.generateExpression(sAssign.expression)
                this._geometryLines.addLine(`${sAssign.variableName} = ${expr};`);
            } break;
            case "condition": {
                let sCondition = stat as Specification.StatementCondition;
                if(sCondition.trueStatements.length > 0 && sCondition.falseStatements.length > 0) {
                    this._geometryLines.addLine(`if(${this.generateExpression(sCondition.condition)}) {`);
                    this._geometryLines.indent();
                    this.addStatements(sCondition.trueStatements);
                    this._geometryLines.unindent();
                    this._geometryLines.addLine(`} else {`);
                    this._geometryLines.indent();
                    this.addStatements(sCondition.falseStatements);
                    this._geometryLines.unindent();
                    this._geometryLines.addLine(`}`);
                } else if(sCondition.trueStatements.length > 0) {
                    this._geometryLines.addLine(`if(${this.generateExpression(sCondition.condition)}) {`);
                    this._geometryLines.indent();
                    this.addStatements(sCondition.trueStatements);
                    this._geometryLines.unindent();
                    this._geometryLines.addLine(`}`);
                } else if(sCondition.falseStatements.length > 0) {
                    this._geometryLines.addLine(`if(!${this.generateExpression(sCondition.condition)}) {`);
                    this._geometryLines.indent();
                    this.addStatements(sCondition.trueStatements);
                    this._geometryLines.unindent();
                    this._geometryLines.addLine(`}`);
                }
            } break;
            case "for": {
                let sForLoop = stat as Specification.StatementForLoop;
                this._geometryLines.addLine(`for(int ${sForLoop.variableName} = ${sForLoop.rangeMin}; ${sForLoop.variableName} <= ${sForLoop.rangeMax}; ${sForLoop.variableName}++) {`);
                this._geometryLines.indent();
                this.addStatements(sForLoop.statements);
                this._geometryLines.unindent();
                this._geometryLines.addLine(`}`);
            } break;
            case "emit": {
                let sEmit = stat as Specification.StatementEmit;
                for(let name in sEmit.attributes) {
                    this._geometryLines.addLine(`out_${name} = ${this.generateExpression(sEmit.attributes[name])};`);
                }
                switch(this._positionType) {
                    case "Vector2": {
                        this._geometryLines.addLine("gl_Position = s3_render_vertex(vec3(out_position, 0.0));");
                    } break;
                    case "Vector3": {
                        this._geometryLines.addLine("gl_Position = s3_render_vertex(out_position);");
                    } break;
                    case "Vector4": {
                        this._geometryLines.addLine("gl_Position = s3_render_vertex(out_position.xyz);");
                    } break;
                }
                this._geometryLines.addLine("EmitVertex();");
                this._geometryLines.addLine("s3_emit_count += 1;");
                this._geometryLines.addLine("if(s3_emit_count % 3 == 0) EndPrimitive();");
            } break;
        }
    }

    public compileSpecification(spec: Specification.Shape, asUniform: (name: string) => boolean) {
        this._vertexLines.addLine("#version 330");
        this._geometryLines.addLine("#version 330");
        this._geometryLines.addLine("layout(points) in;");
        this._geometryLines.addLine("layout(triangle_strip, max_vertices = 50) out;");
        this._geometryLines.addLine(this._prefixCode);
        // Global attributes.
        for(let name in spec.input) {
            if(spec.input.hasOwnProperty(name)) {
                if(asUniform(name)) {
                    this._geometryLines.addDeclaration(name, spec.input[name].type, "uniform");
                } else {
                    this._vertexLines.addDeclaration(name, spec.input[name].type, "in");
                    this._vertexLines.addDeclaration("vout_" + name, spec.input[name].type, "out");
                    this._geometryLines.addArrayDeclaration("vout_" + name, spec.input[name].type, 1, "in");
                }
            }
        }
        this.addAdditionalCode(`
            vec4 s3_render_vertex(vec3 p) {
                return omni_render(omni_transform(p));
            }
        `)
        this._geometryLines.addLine("@additionalCode");
        // Output attributes.
        for(let name in spec.output) {
            if(spec.output.hasOwnProperty(name)) {
                this._geometryLines.addDeclaration("out_" + name, spec.output[name].type, "out");
                if(name == "position") {
                    this._positionType = spec.output[name].type;
                }
                if(name == "color") {
                    this._hasColor = true;
                }
                if(name == "normal") {
                    this._hasNormal = true;
                }
            }
        }
        // The vertex shader.
        this._vertexLines.addLine("void main() {");
        this._vertexLines.indent();
        for(let name in spec.input) {
            if(spec.input.hasOwnProperty(name)) {
                if(!asUniform(name)) {
                    this._vertexLines.addLine(`vout_${name} = ${name};`);
                }
            }
        }
        this._vertexLines.unindent();
        this._vertexLines.addLine("}");
        // The geometry shader.
        this._geometryLines.addLine("void main() {");
        this._geometryLines.indent();
        this._geometryLines.addLine("int s3_emit_count = 0;");
        for(let name in spec.input) {
            if(spec.input.hasOwnProperty(name)) {
                if(!asUniform(name)) {
                    this._geometryLines.addDeclaration(name, spec.input[name].type);
                    this._geometryLines.addLine(`${name} = vout_${name}[0];`);
                }
            }
        }
        // Define arguments.
        for(let name in spec.variables) {
            if(spec.variables.hasOwnProperty(name)) {
                let type = spec.variables[name];
                this._geometryLines.addDeclaration(name, type);
            }
        }
        this.addStatements(spec.statements);
        this._geometryLines.unindent();
        this._geometryLines.addLine("}");

        this._geometryLines.addNamedBlock("additionalCode", this._additionalCodes.join("\n"));
    }

    public addStatements(stat: Specification.Statement[]) {
        stat.forEach((s) => this.addStatement(s));
    }

    public getVertexCode(): string {
        return this._vertexLines.getCode();
    }

    public getGeometryCode(): string {
        return this._geometryLines.getCode();
    }

    public getFragmentCode(): string {
        if(this._hasColor) {
            if(this._hasNormal) {
                return `
                    #version 330
                    in vec4 out_color;
                    in vec3 out_normal;
                    in vec3 out_position;
                    uniform vec3 omni_position;
                    layout(location = 0) out vec4 fout_fragcolor;
                    void main() {
                        vec3 lighting = normalize(out_position - omni_position);
                        float NdotL = abs(dot(out_normal, lighting));

                        fout_fragcolor = vec4((NdotL * 0.5 + 0.5) * out_color.rgb, out_color.a);
                    }
                `;
            } else {
                return `
                    #version 330
                    in vec4 out_color;
                    layout(location = 0) out vec4 fout_fragcolor;
                    void main() {
                        fout_fragcolor = out_color;
                    }
                `;
            }
        } else {
            return `
                #version 330
                layout(location = 0) out vec4 fout_fragcolor;
                void main() {
                    fout_fragcolor = vec4(1, 1, 1, 1);
                }
            `;
        }
    }
}