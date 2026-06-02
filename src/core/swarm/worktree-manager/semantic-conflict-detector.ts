import {
  SemanticConflict,
  SemanticConflictType,
} from '@roo-code/types'

/**
 * SemanticConflictDetector analyzes code structure to detect conflicts
 * beyond simple text diffs. It detects:
 *
 * - Function signature conflicts: two agents modify the same function signature differently
 * - Class structure conflicts: two agents modify the same class (add/remove methods, change inheritance)
 * - API contract conflicts: two agents change the same interface/type in incompatible ways
 * - Configuration conflicts: two agents modify the same config file with conflicting values
 * - Dependency conflicts: two agents add conflicting dependencies to package.json
 *
 * Design notes:
 * - Uses regex-based structural extraction for JS/TS code (lightweight AST)
 * - Uses JSON.parse for config/package files
 * - No external AST parser dependencies required
 * - Returns SemanticConflict[] that can be integrated with ConflictDetector
 */
export class SemanticConflictDetector {
  /**
   * Detect semantic conflicts between two versions of a file.
   *
   * @param filePath - The file path being analyzed
   * @param content1 - Content from agent 1 (first version)
   * @param content2 - Content from agent 2 (second version)
   * @returns Array of SemanticConflict objects describing structural incompatibilities
   */
  detectSemanticConflicts(
    filePath: string,
    content1: string,
    content2: string,
  ): SemanticConflict[] {
    const conflicts: SemanticConflict[] = []

    // Route to appropriate detector based on file type
    if (this.isPackageJsonFile(filePath)) {
      conflicts.push(...this.detectDependencyConflicts(content1, content2, filePath))
    } else if (this.isConfigFile(filePath)) {
      conflicts.push(...this.detectConfigurationConflicts(content1, content2, filePath))
    } else if (this.isCodeFile(filePath)) {
      conflicts.push(...this.detectFunctionSignatureConflicts(content1, content2, filePath))
      conflicts.push(...this.detectClassStructureConflicts(content1, content2, filePath))
      conflicts.push(...this.detectApiContractConflicts(content1, content2, filePath))
    }

    return conflicts
  }

  // --- Function Signature Conflict Detection ---

  /**
   * Detect conflicts where two agents modify the same function signature differently.
   * Extracts function declarations and compares their signatures.
   */
  detectFunctionSignatureConflicts(
    content1: string,
    content2: string,
    filePath: string,
  ): SemanticConflict[] {
    const conflicts: SemanticConflict[] = []
    const signatures1 = this.extractFunctionSignatures(content1)
    const signatures2 = this.extractFunctionSignatures(content2)

    for (const [name, sig1] of signatures1) {
      const sig2 = signatures2.get(name)
      if (!sig2) {
        // Function was removed by agent 2
        continue
      }

      if (sig1 !== sig2) {
        // Same function name but different signature
        conflicts.push({
          type: 'function_signature',
          location: `${filePath}:${name}`,
          description: `Function '${name}' has conflicting signatures: agent1='${sig1}', agent2='${sig2}'`,
          severity: 'high',
          affectedSymbols: [name],
        })
      }
    }

    return conflicts
  }

  // --- Class Structure Conflict Detection ---

  /**
   * Detect conflicts where two agents modify the same class structure.
   * Compares class declarations, method sets, and inheritance.
   */
  detectClassStructureConflicts(
    content1: string,
    content2: string,
    filePath: string,
  ): SemanticConflict[] {
    const conflicts: SemanticConflict[] = []
    const classes1 = this.extractClassStructures(content1)
    const classes2 = this.extractClassStructures(content2)

    for (const [name, class1] of classes1) {
      const class2 = classes2.get(name)
      if (!class2) {
        continue
      }

      // Check inheritance conflicts
      if (class1.extends !== class2.extends) {
        conflicts.push({
          type: 'class_structure',
          location: `${filePath}:${name}`,
          description: `Class '${name}' has conflicting inheritance: agent1 extends '${class1.extends ?? 'none'}', agent2 extends '${class2.extends ?? 'none'}'`,
          severity: 'critical',
          affectedSymbols: [name],
        })
      }

      // Check method conflicts — methods present in one but not the other
      const methods1Set = new Set(class1.methods)
      const methods2Set = new Set(class2.methods)

      const removedMethods = new Set([...methods1Set].filter(m => !methods2Set.has(m)))
      const addedMethods = new Set([...methods2Set].filter(m => !methods1Set.has(m)))

      if (removedMethods.size > 0 || addedMethods.size > 0) {
        const affected = [...removedMethods, ...addedMethods]
        const details: string[] = []
        if (removedMethods.size > 0) {
          details.push(`removed by agent2: ${[...removedMethods].join(', ')}`)
        }
        if (addedMethods.size > 0) {
          details.push(`added by agent2: ${[...addedMethods].join(', ')}`)
        }

        conflicts.push({
          type: 'class_structure',
          location: `${filePath}:${name}`,
          description: `Class '${name}' has conflicting methods: ${details.join('; ')}`,
          severity: 'medium',
          affectedSymbols: [name, ...affected],
        })
      }
    }

    return conflicts
  }

  // --- API Contract Conflict Detection ---

  /**
   * Detect conflicts where two agents change the same interface/type in incompatible ways.
   * Compares interface and type alias declarations.
   */
  detectApiContractConflicts(
    content1: string,
    content2: string,
    filePath: string,
  ): SemanticConflict[] {
    const conflicts: SemanticConflict[] = []
    const interfaces1 = this.extractInterfaceStructures(content1)
    const interfaces2 = this.extractInterfaceStructures(content2)

    for (const [name, iface1] of interfaces1) {
      const iface2 = interfaces2.get(name)
      if (!iface2) {
        continue
      }

      // Check property conflicts
      const props1Set = new Set(iface1.properties)
      const props2Set = new Set(iface2.properties)

      const removedProps = new Set([...props1Set].filter(p => !props2Set.has(p)))
      const addedProps = new Set([...props2Set].filter(p => !props1Set.has(p)))

      if (removedProps.size > 0 || addedProps.size > 0) {
        const affected = [...removedProps, ...addedProps]
        const details: string[] = []
        if (removedProps.size > 0) {
          details.push(`removed properties: ${[...removedProps].join(', ')}`)
        }
        if (addedProps.size > 0) {
          details.push(`added properties: ${[...addedProps].join(', ')}`)
        }

        conflicts.push({
          type: 'api_contract',
          location: `${filePath}:${name}`,
          description: `Interface '${name}' has conflicting properties: ${details.join('; ')}`,
          severity: 'critical',
          affectedSymbols: [name, ...affected],
        })
      }
    }

    // Also check type aliases
    const types1 = this.extractTypeAliases(content1)
    const types2 = this.extractTypeAliases(content2)

    for (const [name, type1] of types1) {
      const type2 = types2.get(name)
      if (!type2) {
        continue
      }

      if (type1 !== type2) {
        conflicts.push({
          type: 'api_contract',
          location: `${filePath}:${name}`,
          description: `Type alias '${name}' has conflicting definitions: agent1='${type1}', agent2='${type2}'`,
          severity: 'critical',
          affectedSymbols: [name],
        })
      }
    }

    return conflicts
  }

  // --- Configuration Conflict Detection ---

  /**
   * Detect conflicts in configuration files where two agents modify
   * the same config keys with different values.
   */
  detectConfigurationConflicts(
    content1: string,
    content2: string,
    filePath: string,
  ): SemanticConflict[] {
    const conflicts: SemanticConflict[] = []

    let config1: Record<string, unknown>
    let config2: Record<string, unknown>

    try {
      config1 = JSON.parse(content1)
    } catch {
      // Content1 is not valid JSON — can't compare
      return conflicts
    }

    try {
      config2 = JSON.parse(content2)
    } catch {
      // Content2 is not valid JSON — can't compare
      return conflicts
    }

    // Find conflicting values for the same keys
    const conflictingKeys = this.findConflictingConfigKeys(config1, config2)

    for (const key of conflictingKeys) {
      conflicts.push({
        type: 'configuration',
        location: `${filePath}:${key}`,
        description: `Config key '${key}' has conflicting values: agent1='${JSON.stringify(config1[key])}', agent2='${JSON.stringify(config2[key])}'`,
        severity: 'medium',
        affectedSymbols: [key],
      })
    }

    return conflicts
  }

  // --- Dependency Conflict Detection ---

  /**
   * Detect conflicts in package.json where two agents add conflicting dependencies.
   * Checks for version conflicts in the same dependency name.
   */
  detectDependencyConflicts(
    content1: string,
    content2: string,
    filePath: string,
  ): SemanticConflict[] {
    const conflicts: SemanticConflict[] = []

    let pkg1: Record<string, unknown>
    let pkg2: Record<string, unknown>

    try {
      pkg1 = JSON.parse(content1)
    } catch {
      return conflicts
    }

    try {
      pkg2 = JSON.parse(content2)
    } catch {
      return conflicts
    }

    // Check dependencies, devDependencies, peerDependencies
    const depSections = ['dependencies', 'devDependencies', 'peerDependencies']

    for (const section of depSections) {
      const deps1 = pkg1[section] as Record<string, string> | undefined
      const deps2 = pkg2[section] as Record<string, string> | undefined

      if (!deps1 || !deps2) {
        continue
      }

      for (const [depName, version1] of Object.entries(deps1)) {
        const version2 = deps2[depName]
        if (!version2) {
          continue
        }

        if (version1 !== version2) {
          conflicts.push({
            type: 'dependency',
            location: `${filePath}:${section}.${depName}`,
            description: `Dependency '${depName}' has conflicting versions in ${section}: agent1='${version1}', agent2='${version2}'`,
            severity: 'high',
            affectedSymbols: [depName],
          })
        }
      }
    }

    return conflicts
  }

  // --- Structural Extraction Helpers (Lightweight AST) ---

  /**
   * Extract function signatures from TypeScript/JavaScript code.
   * Returns a Map of function name → signature string.
   *
   * Matches:
   * - function declarations: function foo(a: string): number
   * - arrow functions: const foo = (a: string): number =>
   * - method declarations: foo(a: string): number
   */
  private extractFunctionSignatures(content: string): Map<string, string> {
    const signatures = new Map<string, string>()

    // Match function declarations
    const funcDeclRegex = /function\s+(\w+)\s*\(([^)]*)\)\s*(?:\:\s*([^{\n]+?))?\s*[{=\n]/g
    let match: RegExpExecArray | null
    while ((match = funcDeclRegex.exec(content)) !== null) {
      const name = match[1]
      const params = match[2].trim()
      const returnType = match[3]?.trim() ?? ''
      signatures.set(name, `(${params})${returnType ? ':' + returnType : ''}`)
    }

    // Match arrow function variable declarations
    const arrowFuncRegex = /(?:const|let|var)\s+(\w+)\s*=\s*\(([^)]*)\)\s*(?:\:\s*([^=]+?))?\s*=>/g
    while ((match = arrowFuncRegex.exec(content)) !== null) {
      const name = match[1]
      const params = match[2].trim()
      const returnType = match[3]?.trim() ?? ''
      signatures.set(name, `(${params})${returnType ? ':' + returnType : ''}`)
    }

    return signatures
  }

  /**
   * Extract class structures from TypeScript/JavaScript code.
   * Returns a Map of class name → { extends, methods }.
   */
  private extractClassStructures(content: string): Map<string, ClassStructure> {
    const classes = new Map<string, ClassStructure>()

    // Match class declarations with optional extends
    const classRegex = /class\s+(\w+)\s*(?:extends\s+(\w+))?\s*[{]/g
    let match: RegExpExecArray | null
    while ((match = classRegex.exec(content)) !== null) {
      const name = match[1]
      const extendsClass = match[2] ?? null

      // Extract methods from the class body
      // Find the class body between the opening { and the matching closing }
      const classStart = match.index + match[0].length - 1
      const classBody = this.extractBlockContent(content, classStart)
      const methods = this.extractMethodNames(classBody)

      classes.set(name, { extends: extendsClass, methods })
    }

    return classes
  }

  /**
   * Extract interface structures from TypeScript code.
   * Returns a Map of interface name → { properties }.
   */
  private extractInterfaceStructures(content: string): Map<string, InterfaceStructure> {
    const interfaces = new Map<string, InterfaceStructure>()

    // Match interface declarations
    const interfaceRegex = /interface\s+(\w+)\s*(?:extends\s+[\w,\s]+)?\s*[{]/g
    let match: RegExpExecArray | null
    while ((match = interfaceRegex.exec(content)) !== null) {
      const name = match[1]
      const interfaceStart = match.index + match[0].length - 1
      const interfaceBody = this.extractBlockContent(content, interfaceStart)
      const properties = this.extractPropertyNames(interfaceBody)

      interfaces.set(name, { properties })
    }

    return interfaces
  }

  /**
   * Extract type aliases from TypeScript code.
   * Returns a Map of type name → type definition string.
   */
  private extractTypeAliases(content: string): Map<string, string> {
    const types = new Map<string, string>()

    // Match type alias declarations
    const typeRegex = /type\s+(\w+)\s*=\s*([^\n;]+)/g
    let match: RegExpExecArray | null
    while ((match = typeRegex.exec(content)) !== null) {
      const name = match[1]
      const definition = match[2].trim()
      types.set(name, definition)
    }

    return types
  }

  /**
   * Extract the content of a block between matching braces.
   */
  private extractBlockContent(content: string, startBraceIndex: number): string {
    let depth = 0
    let end = startBraceIndex

    for (let i = startBraceIndex; i < content.length; i++) {
      if (content[i] === '{') {
        depth++
      } else if (content[i] === '}') {
        depth--
        if (depth === 0) {
          end = i
          break
        }
      }
    }

    return content.substring(startBraceIndex + 1, end)
  }

  /**
   * Extract method names from a class body.
   */
  private extractMethodNames(classBody: string): string[] {
    const methods: string[] = []
    // Match method declarations: name(params) or async name(params)
    const methodRegex = /(?:async\s+)?(\w+)\s*\(/g
    let match: RegExpExecArray | null
    while ((match = methodRegex.exec(classBody)) !== null) {
      const name = match[1]
      // Skip constructor and 'function' keyword false matches
      if (name !== 'constructor' && name !== 'function' && name !== 'async') {
        methods.push(name)
      }
    }
    // Always include constructor if present
    const constructorRegex = /constructor\s*\(/g
    if (constructorRegex.exec(classBody)) {
      methods.push('constructor')
    }
    return methods
  }

  /**
   * Extract property names from an interface/type body.
   */
  private extractPropertyNames(body: string): string[] {
    const properties: string[] = []
    // Match property declarations: name: type or name?: type or readonly name: type
    const propRegex = /(?:readonly\s+)?(\w+)\s*[??:]/g
    let match: RegExpExecArray | null
    while ((match = propRegex.exec(body)) !== null) {
      properties.push(match[1])
    }
    return properties
  }

  /**
   * Find config keys that have different values between two config objects.
   * Recursively checks nested objects.
   */
  private findConflictingConfigKeys(
    config1: Record<string, unknown>,
    config2: Record<string, unknown>,
    prefix: string = '',
  ): string[] {
    const conflicting: string[] = []

    for (const key of Object.keys(config1)) {
      const fullKey = prefix ? `${prefix}.${key}` : key
      const val1 = config1[key]
      const val2 = config2[key]

      if (val2 === undefined) {
        // Key removed by agent2 — not a value conflict
        continue
      }

      if (typeof val1 === 'object' && typeof val2 === 'object' && val1 !== null && val2 !== null) {
        // Recursively check nested objects
        const nestedConflicts = this.findConflictingConfigKeys(
          val1 as Record<string, unknown>,
          val2 as Record<string, unknown>,
          fullKey,
        )
        conflicting.push(...nestedConflicts)
      } else if (val1 !== val2) {
        conflicting.push(fullKey)
      }
    }

    return conflicting
  }

  // --- File Type Helpers ---

  private isPackageJsonFile(filePath: string): boolean {
    return filePath === 'package.json' || filePath.endsWith('/package.json')
  }

  private isConfigFile(filePath: string): boolean {
    const configPatterns = [
      '.json',
      '.config.json',
      '.config.ts',
      '.config.js',
      'tsconfig.json',
      '.eslintrc',
      '.prettierrc',
    ]
    return configPatterns.some((p) => filePath.endsWith(p))
  }

  private isCodeFile(filePath: string): boolean {
    const codeExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs']
    return codeExtensions.some((ext) => filePath.endsWith(ext))
  }
}

// Internal types for structural extraction
interface ClassStructure {
  extends: string | null
  methods: string[]
}

interface InterfaceStructure {
  properties: string[]
}