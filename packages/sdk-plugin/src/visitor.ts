import { Types } from "@graphql-codegen/plugin-helpers";
import { ClientSideBaseVisitor, indentMultiline, LoadedFragment } from "@graphql-codegen/visitor-plugin-common";
import autoBind from "auto-bind";
import { concatAST, DocumentNode, GraphQLSchema, OperationDefinitionNode, visit } from "graphql";
import { getArgList } from "./args";
import { RawSdkPluginConfig, SdkPluginConfig } from "./config";
import c from "./constants";
import { getOperation, SdkOperationDefinition } from "./operation";
import { printApiFunctionName, printApiFunctionType, printDocBlock } from "./print";
import { debug, filterJoin } from "./utils";

/**
 * Definition of an operation for outputting an sdk function
 */
export interface SdkOperation {
  /** The graphql node being processed with chain info added */
  node: SdkOperationDefinition;
  /** The name of the generated graphql document */
  documentVariableName: string;
  /** The type of the graphql operation */
  operationType: string;
  /** The type of the result from the graphql operation */
  operationResultType: string;
  /** The type of the variables for the graphql operation */
  operationVariablesTypes: string;
}

/**
 * Initialise and process a vistor for each node in the documents
 */
export function createVisitor(
  schema: GraphQLSchema,
  documents: Types.DocumentFile[],
  documentNodes: DocumentNode[],
  fragments: LoadedFragment[],
  config: RawSdkPluginConfig,
  chainKey?: string
): {
  ast: DocumentNode;
  visitor: SdkVisitor;
  result: {
    fragments: string;
    definitions: unknown[];
  };
} {
  /** Ensure the documents validate as a single application */
  const ast = concatAST(documentNodes);

  /** Create an ast visitor configured with the plugin input */
  const visitor = new SdkVisitor(schema, fragments, config, documents, chainKey);

  /** Process each node of the ast with the visitor */
  const result = visit(ast, { leave: visitor });

  return {
    ast,
    visitor,
    result,
  };
}

/**
 * Graphql-codegen visitor for processing the ast
 *
 * @param name the name of the function
 * @param type the name of the type of the function
 * @param initialArgs any additional args to be used at the start of the function definition
 * @param schema the graphql schema to validate against
 * @param fragments graphql fragments
 * @param rawConfig the plugin config
 * @param documents the list of graphql operations
 */
export class SdkVisitor extends ClientSideBaseVisitor<RawSdkPluginConfig, SdkPluginConfig> {
  private _operationsToInclude: SdkOperation[] = [];
  private _apiName: string;
  private _apiType: string;
  private _chainKey: string | undefined;

  /**
   * Initialise the visitor
   */
  public constructor(
    schema: GraphQLSchema,
    fragments: LoadedFragment[],
    rawConfig: RawSdkPluginConfig,
    documents?: Types.DocumentFile[],
    chainKey?: string
  ) {
    super(
      schema,
      fragments,
      rawConfig,
      {
        typeFile: rawConfig.typeFile,
        documentFile: rawConfig.documentFile,
      },
      documents
    );
    autoBind(this);

    this._chainKey = chainKey;
    this._apiName = printApiFunctionName(chainKey);
    this._apiType = printApiFunctionType(chainKey);
    debug(chainKey ?? "root", "apiName", this._apiName);
    debug(chainKey ?? "root", "apiType", this._apiType);
  }

  /**
   * Record each operation to process later
   */
  protected buildOperation(
    node: OperationDefinitionNode,
    documentVariableName: string,
    operationType: string,
    operationResultType: string,
    operationVariablesTypes: string
  ): string {
    this._operationsToInclude.push({
      node: (node as unknown) as SdkOperationDefinition,
      documentVariableName,
      operationType,
      operationResultType,
      operationVariablesTypes,
    });

    return "";
  }

  /**
   * Return the generated sdk string content
   */
  public get sdkContent(): string {
    debug(this._chainKey ?? "root", "operations", this._operationsToInclude.length);

    /** For each operation get the function string content */
    const operations = filterJoin(
      this._operationsToInclude.map(o => getOperation(o, this.config)).map(s => indentMultiline(s, 2)),
      ",\n"
    );

    const args = getArgList([
      /** Add an initial id arg if in a nested api */
      this._chainKey
        ? {
            name: c.ID_NAME,
            optional: false,
            type: c.ID_TYPE,
            description: `${c.ID_NAME} to scope the returned operations by`,
          }
        : undefined,
      /** The requester function arg */
      {
        name: c.REQUESTER_NAME,
        optional: false,
        type: `${c.REQUESTER_TYPE}<${c.OPTIONS_TYPE}>`,
        description: "function to call the graphql client",
      },
      /** The wrapper function arg */
      {
        name: c.WRAPPER_NAME,
        optional: false,
        type: c.WRAPPER_TYPE,
        defaultName: c.WRAPPER_DEFAULT_NAME,
        description: "wrapper function to process before or after the operation is called",
      },
    ]);

    const apiDescription = this._chainKey
      ? `Initialise a set of operations, scoped to ${this._chainKey}, to run against the Linear api`
      : "Initialise a set of operations to run against the Linear api";

    return `
      ${printDocBlock([
        apiDescription,
        ...args.jsdoc,
        this._chainKey
          ? `@returns The set of available operations scoped to a single ${this._chainKey}`
          : "@returns The set of available operations",
      ])}
      export function ${this._apiName}<${c.OPTIONS_TYPE}>(${args.print}) {
        return {
          ${operations}
        };
      }
      
      ${printDocBlock([`The returned type from calling ${this._apiName}`, apiDescription])}
      export type ${this._apiType} = ReturnType<typeof ${this._apiName}>;
    `;
  }
}