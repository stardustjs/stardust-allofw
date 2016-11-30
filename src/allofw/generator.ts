// import { convertTypeName, convertConstant } from "./types";
// import { generateIntrinsicFunction } from "./intrinsics";
// import { Specification } from "stardust-core";
// import { Binding } from "stardust-core";
// import { Dictionary } from "stardust-core";

// export enum GenerateMode {
//     NORMAL   = 0,
//     PICK     = 1,
// }


// export enum ViewType {
//     VIEW_2D = 0,
//     VIEW_3D = 1
// }


// export class Generator {
//     private _prefixCode: string;
//     private _additionalCodes: string[];
//     private _lines: string[];
//     private _currentIndent: string;
//     private _hasColor: boolean;
//     private _hasNormal: boolean;
//     private _positionType: string;
//     private _currentLocation: number;

//     constructor(prefixCode: string) {
//         this._prefixCode = prefixCode;
//         this._lines = [];
//         this._additionalCodes = [];
//         this._currentIndent = "";
//         this._hasColor = false;
//         this._hasNormal = false;
//         this._currentLocation = 0;
//     }

//     public addLine(code: string) {
//         this._lines.push(this._currentIndent + code);
//     }

//     public addAdditionalCode(code: string) {
//         if(this._additionalCodes.indexOf(code) < 0) {
//             this._additionalCodes.push(code);
//         }
//     }

//     public indent() {
//         this._currentIndent += "    ";
//     }

//     public unindent() {
//         this._currentIndent = this._currentIndent.slice(0, this._currentIndent.length - 4);
//     }

//     public addDeclaration(name: string, type: string) {
//         this.addLine(`${convertTypeName(type)} ${name};`);
//     }

//     public addUniform(name: string, type: string) {
//         this.addLine(`uniform ${convertTypeName(type)} ${name};`);
//     }

//     public addAttribute(name: string, type: string) {
//         this.addLine(`layout(location = ${this._currentLocation}) in ${convertTypeName(type)} ${name};`);
//         this._currentLocation += 1;
//     }

//     public addVarying(name: string, type: string) {
//         if(name == "out_position") {
//             this.addLine(`out ${convertTypeName(type)} ${name};`);
//             this._positionType = type;
//         } else {
//             this.addLine(`out ${convertTypeName(type)} ${name};`);
//             if(name == "out_color") {
//                 this._hasColor = true;
//             }
//             if(name == "out_normal") {
//                 this._hasNormal = true;
//             }
//         }
//     }

//     public generateExpression(expr: Specification.Expression): string {
//         switch(expr.type) {
//             case "constant": {
//                 let eConstant = expr as Specification.ExpressionConstant;
//                 return convertConstant(eConstant.valueType, eConstant.value);
//             }
//             case "variable": {
//                 let eVariable = expr as Specification.ExpressionVariable;
//                 return eVariable.variableName;
//             }
//             case "function": {
//                 let eFunction = expr as Specification.ExpressionFunction;
//                 let args = eFunction.arguments.map((arg) => this.generateExpression(arg));
//                 let { code, additionalCode } = generateIntrinsicFunction(eFunction.functionName, args);
//                 if(additionalCode != null) {
//                     this.addAdditionalCode(additionalCode);
//                 }
//                 return code;
//             }
//             case "field": {
//                 let eField = expr as Specification.ExpressionField;
//                 return `${this.generateExpression(eField.value)}.${eField.fieldName}`;
//             }
//         }
//     }

//     public addStatement(stat: Specification.Statement) {
//         switch(stat.type) {
//             case "assign": {
//                 let sAssign = stat as Specification.StatementAssign;
//                 let expr = this.generateExpression(sAssign.expression)
//                 this.addLine(`${sAssign.variableName} = ${expr};`);
//             } break;
//             case "condition": {
//                 let sCondition = stat as Specification.StatementCondition;
//                 if(sCondition.trueStatements.length > 0 && sCondition.falseStatements.length > 0) {
//                     this.addLine(`if(${this.generateExpression(sCondition.condition)}) {`);
//                     this.indent();
//                     this.addStatements(sCondition.trueStatements);
//                     this.unindent();
//                     this.addLine(`} else {`);
//                     this.indent();
//                     this.addStatements(sCondition.falseStatements);
//                     this.unindent();
//                     this.addLine(`}`);
//                 } else if(sCondition.trueStatements.length > 0) {
//                     this.addLine(`if(${this.generateExpression(sCondition.condition)}) {`);
//                     this.indent();
//                     this.addStatements(sCondition.trueStatements);
//                     this.unindent();
//                     this.addLine(`}`);
//                 } else if(sCondition.falseStatements.length > 0) {
//                     this.addLine(`if(!${this.generateExpression(sCondition.condition)}) {`);
//                     this.indent();
//                     this.addStatements(sCondition.trueStatements);
//                     this.unindent();
//                     this.addLine(`}`);
//                 }
//             } break;
//             case "for": {
//                 let sForLoop = stat as Specification.StatementForLoop;
//                 this.addLine(`for(int ${sForLoop.variableName} = ${sForLoop.rangeMin}; ${sForLoop.variableName} <= ${sForLoop.rangeMax}; ${sForLoop.variableName}++) {`);
//                 this.indent();
//                 this.addStatements(sForLoop.statements);
//                 this.unindent();
//                 this.addLine(`}`);
//             } break;
//             case "emit": {
//                 let sEmit = stat as Specification.StatementEmit;
//                 for(let name in sEmit.attributes) {
//                     this.addLine(`out_${name} = ${this.generateExpression(sEmit.attributes[name])};`);
//                 }
//                 switch(this._positionType) {
//                     case "Vector2": {
//                         this.addLine("gl_Position = s3_render_vertex(vec3(out_position, 0.0));");
//                     } break;
//                     case "Vector3": {
//                         this.addLine("gl_Position = s3_render_vertex(out_position);");
//                     } break;
//                     case "Vector4": {
//                         this.addLine("gl_Position = s3_render_vertex(out_position.xyz);");
//                     } break;
//                 }
//             } break;
//         }
//     }

//     public compileSpecification(spec: Specification.Mark, asUniform: (name: string) => boolean) {
//         this.addLine("#version 330");
//         this.addLine(this._prefixCode);
//         // Global attributes.
//         for(let name in spec.input) {
//             if(spec.input.hasOwnProperty(name)) {
//                 if(asUniform(name)) {
//                     this.addUniform(name, spec.input[name].type);
//                 } else {
//                     this.addAttribute(name, spec.input[name].type);
//                 }
//             }
//         }
//         this.addAdditionalCode(`
//             vec4 s3_render_vertex(vec3 p) {
//                 return omni_render(omni_transform(p));
//             }
//         `)
//         this.addLine("@additionalCode");
//         // Output attributes.
//         for(let name in spec.output) {
//             if(spec.output.hasOwnProperty(name)) {
//                 this.addVarying("out_" + name, spec.output[name].type);
//             }
//         }
//         // The main function.
//         this.addLine("void main() {");
//         this.indent();
//         // Define arguments.
//         for(let name in spec.variables) {
//             if(spec.variables.hasOwnProperty(name)) {
//                 let type = spec.variables[name];
//                 this.addDeclaration(name, type);
//             }
//         }
//         this.addStatements(spec.statements);
//         this.unindent();
//         this.addLine("}");
//     }

//     public addStatements(stat: Specification.Statement[]) {
//         stat.forEach((s) => this.addStatement(s));
//     }

//     public getCode(): string {
//         return this._lines.map((line) => {
//             if(line.trim() == "@additionalCode") return this._additionalCodes.join("\n");
//             return line;
//         }).join("\n");
//     }

//     public getFragmentCode(): string {
//         if(this._hasColor) {
//             if(this._hasNormal) {
//                 return `
//                     #version 330
//                     in vec4 out_color;
//                     in vec3 out_normal;
//                     in vec3 out_position;
//                     uniform vec3 omni_position;
//                     layout(location = 0) out vec4 fout_fragcolor;
//                     void main() {
//                         vec3 lighting = normalize(out_position - omni_position);
//                         float NdotL = abs(dot(out_normal, lighting));

//                         fout_fragcolor = vec4((NdotL * 0.5 + 0.5) * out_color.rgb, out_color.a);
//                     }
//                 `;
//             } else {
//                 return `
//                     #version 330
//                     in vec4 out_color;
//                     layout(location = 0) out vec4 fout_fragcolor;
//                     void main() {
//                         fout_fragcolor = out_color;
//                     }
//                 `;
//             }
//         } else {
//             return `
//                 #version 330
//                 layout(location = 0) out vec4 fout_fragcolor;
//                 void main() {
//                     fout_fragcolor = vec4(1, 1, 1, 1);
//                 }
//             `;
//         }
//     }
// }