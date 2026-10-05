# Repository instructions

These instructions apply to all TypeScript and JavaScript work in this repository.

## Target standard

Write TypeScript that is simple, readable, maintainable, and appropriate for a solid mid-level engineer working in a production codebase.

- Prefer straightforward, boring, predictable code over clever or compact code.
- Optimize for readability, debugging, testing, and modification.
- Follow the established project structure, naming, linting, and formatting conventions.
- Avoid patterns that are more complex than the problem requires.

## Type safety

- Use TypeScript to prevent mistakes, not to demonstrate advanced type-system knowledge.
- Prefer explicit domain types over `any`.
- Use `unknown` for untrusted data, then validate or narrow it.
- Do not use type assertions only to silence the compiler.
- Use an assertion only when a runtime guarantee is already known and cannot be expressed cleanly.
- Never use `as unknown as Type`.
- Avoid unnecessary non-null assertions.
- Model nullable and optional values accurately.

## Types and interfaces

- Use simple object types that reflect the actual domain.
- Prefer `interface` for object contracts expected to be extended or implemented.
- Prefer `type` for unions, intersections, aliases, mapped types, and simple composed types.
- Follow local convention when either `type` or `interface` is equally clear.
- Avoid giant shared types that represent unrelated states.
- Use separate types when states have meaningfully different requirements.
- Do not create types that only rename another type without adding meaning.

## Type inference

- Let TypeScript infer obvious local types.
- Add explicit types when they improve understanding, document a public contract, or prevent incorrect inference.
- Explicitly type public APIs, exported functions, service boundaries, and reusable utilities when useful.
- Avoid redundant annotations for obvious literals.
- Avoid complicated inferred types that are difficult to understand.

## Union types

- Prefer string unions over loosely defined strings.
- Use discriminated unions for objects with multiple meaningful states.
- Make invalid states difficult to represent when this remains simple.
- Avoid complex unions when a simpler domain model is easier to maintain.

```ts
type PaymentResult =
  | {
      status: "success";
      transactionId: string;
    }
  | {
      status: "failed";
      reason: string;
    };
```

## Enums and constants

- Prefer string unions or `as const` objects for small value sets unless the codebase consistently uses enums.
- Do not use enums only because a value has multiple options.
- Use constants for meaningful repeated values.
- Do not create constants for values used once when the value is already obvious.

## Functions

- Keep functions focused on one responsibility.
- Prefer simple inputs and outputs.
- Use an options object when multiple parameters are related or optional.
- Avoid many positional parameters.
- Use generics only when they provide real type safety or reuse.
- Prefer concrete types when a function has one real use case.

```ts
type CreateUserInput = {
  email: string;
  name: string;
  role: UserRole;
};

async function createUser(input: CreateUserInput): Promise<User> {
  // implementation
}
```

## Control flow

- Prefer simple `if` statements, loops, and explicit branches.
- Use early returns when they reduce nesting.
- Avoid deeply nested conditions and nested ternaries.
- Avoid long array-method chains when a loop is easier to understand.
- Use `map`, `filter`, and `find` when they naturally describe the operation.
- Do not force functional programming patterns into ordinary application logic.

## Async code

- Prefer `async` and `await` over manual promise chains.
- Do not mix `await` and `.then()` without a clear reason.
- Use `Promise.all` for independent operations that should succeed together.
- Use `Promise.allSettled` when failures should be handled independently.
- Consider database limits, API rate limits, memory, and ordering before adding concurrency.
- Make async error ownership clear.

## Error handling

- Handle expected errors explicitly.
- Never silently swallow exceptions or use empty `catch` blocks.
- Do not catch an error only to throw the same error.
- Add useful context when converting infrastructure errors into application errors.
- Distinguish expected domain errors from unexpected system failures when useful.
- Do not use exceptions for normal control flow.

```ts
const user = await userRepository.findById(userId);

if (!user) {
  throw new UserNotFoundError(userId);
}
```

## Error types

- Create custom error classes only when callers need to distinguish error categories.
- Do not create a separate class for every possible failure.
- Include useful context such as IDs or operation names.
- Do not expose sensitive internal details in user-facing errors.

## Null and undefined

- Handle `null` and `undefined` intentionally.
- Do not use optional chaining as a substitute for understanding whether data should exist.
- Use optional chaining when absence is valid.
- Fail early when required data is missing.
- Keep a consistent `null` versus `undefined` convention.
- Use `??` when valid falsy values such as `0`, `false`, or `""` must be preserved.
- Avoid long optional chains that hide unexpected missing data.

## Validation

- Treat HTTP requests, environment variables, queue payloads, webhooks, file input, and external API responses as untrusted.
- Validate untrusted values at their boundary.
- Use Zod when runtime validation is needed.
- Derive TypeScript types from schemas when practical to avoid duplicated definitions.
- Never assume a TypeScript type provides runtime validation.

```ts
const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
});

type CreateUserInput = z.infer<typeof createUserSchema>;
```

## Objects and data transformation

- Prefer explicit object construction when mapping between layers.
- Do not spread large objects blindly across API, domain, and database boundaries.
- Do not return persistence entities directly from public APIs when their shape is not the API contract.
- Avoid accidental field leakage through object spreading.

## Classes and dependency injection

- Use classes when they provide clear value, such as framework services, stateful components, or domain objects with behavior.
- Use a plain function or object when it is enough.
- Prefer composition over inheritance.
- Avoid deep inheritance and abstract base classes without multiple real implementations.
- Inject meaningful repositories, clients, and services when the framework or architecture supports it.
- Do not inject tiny utility functions unnecessarily.
- Keep constructors focused. Too many dependencies may indicate too many responsibilities.

## Generics and utility types

- Use generics only when the input-output relationship genuinely matters.
- Keep generic signatures simple.
- Avoid deeply nested conditional types, recursive types, and advanced mapped types unless they solve a real problem.
- Prefer understandable duplication over a difficult abstraction.
- Use `Pick`, `Omit`, `Partial`, and `Record` when they clarify relationships.
- Define a dedicated domain type when stacked utility types become hard to understand.

## Imports and modules

- Keep imports organized according to project conventions.
- Prefer named imports.
- Avoid wildcard imports unless a library requires them.
- Remove unused imports and avoid circular dependencies.
- Do not create barrel files everywhere when they obscure dependency direction.
- Keep related code close together.
- Split modules by responsibility, not arbitrary file size.
- Do not create one file per tiny function when the functions belong to one concept.
- Keep public module APIs small.

## Architecture

- Respect boundaries between controllers, services, repositories, domain logic, and infrastructure.
- Keep HTTP-specific logic in controllers or transport layers.
- Keep database-specific logic in repositories or persistence layers.
- Keep business rules in services, use cases, or domain modules.
- Do not pass framework request or response objects deep into business logic.
- Do not leak ORM-specific types through the application.

## Database code

- Avoid N+1 queries.
- Prefer explicit queries when performance matters.
- Use transactions when multiple operations must succeed or fail together.
- Keep transactions short.
- Do not fetch unneeded columns in expensive or frequent queries.
- Do not hide complex operations behind overly generic repositories.
- Use database constraints for rules that must always hold.

## API code

- Validate input at the API boundary.
- Return consistent response shapes.
- Keep status-code decisions in the transport layer.
- Do not expose raw database errors.
- Separate API DTOs from persistence models when their responsibilities differ.
- Consider backward compatibility when changing public contracts.

## Logging

- Log information that helps diagnose production issues.
- Include context such as request IDs, entity IDs, job IDs, and operation names.
- Avoid logging entire large objects.
- Never log secrets, tokens, passwords, credentials, or sensitive data.
- Logging is not a substitute for error handling.

## Configuration

- Validate required environment variables during startup.
- Do not spread direct `process.env` access throughout the application.
- Centralize configuration when the project benefits from it.
- Convert environment variables to their runtime types once.

## Comments

- Do not comment obvious code.
- Explain unusual decisions, constraints, workarounds, or non-obvious behavior.
- Explain why code exists instead of narrating each line.
- Keep comments natural and brief.

## Naming

- Use names that communicate intent and match product terminology.
- Avoid vague names such as `data`, `obj`, `temp`, `thing`, and `handler` when a specific name is available.
- Boolean names should describe a condition, such as `isActive`, `hasPermission`, `shouldRetry`, or `canPublish`.
- Functions should describe an action, such as `createInvoice`, `findAvailableWarehouse`, or `calculateRetryDelay`.

## Shorthand and abstractions

- Use shorthand when it is common and improves readability.
- Prefer explicit code when shorthand hides behavior.
- Avoid dense destructuring and clever one-liners for non-trivial logic.
- Do not abstract based on hypothetical future reuse.
- Extract an abstraction for actual duplication, a clear architectural boundary, or a stable shared concept.
- Prefer a little duplication over the wrong abstraction.
- Avoid generic repositories, base services, base controllers, factories with one implementation, excessive DTO layers, premature event-driven architecture, and unnecessary CQRS.
- Do not wrap a library unless the wrapper creates a meaningful application boundary.

## Dependencies and performance

- Prefer built-in language and platform features when they solve the problem clearly.
- Reuse existing dependencies before adding new ones.
- Do not install a library for a small piece of straightforward logic.
- Keep important third-party APIs behind an application boundary.
- Write readable and correct code first.
- Avoid repeated queries, parsing, serialization, and network calls.
- Do not load large datasets into memory without need.
- Optimize based on real bottlenecks, not micro-optimizations.

## Testing

- Test meaningful behavior, business logic, edge cases, failure paths, and important integrations.
- Avoid tests coupled to implementation details.
- Do not mock every internal function.
- Mock external boundaries such as APIs, queues, clocks, and storage.
- Add regression tests for important bug fixes.
- Keep tests readable because tests are production code.

## Avoid TypeScript overengineering

Do not introduce these unless they clearly solve a current problem:

- Complex generic abstractions
- Deep inheritance
- Generic repository patterns for every entity
- Base service or controller classes
- Excessive dependency injection
- Multiple wrappers around simple libraries
- Custom result types everywhere
- Advanced conditional types
- Excessive decorators
- Factories with one implementation
- Interfaces with one implementation and no architectural reason
- Premature event-driven abstractions
- Unnecessary CQRS
- Excessive DTO mapping layers
- Utility modules filled with unrelated helpers

## Review checklist

Before finishing, ask:

- Can another developer understand this quickly?
- Is the type system helping rather than making the code harder to understand?
- Is each abstraction solving a current problem?
- Can the function be simpler?
- Are errors handled at the correct layer?
- Are external inputs validated?
- Does the change introduce unnecessary coupling?
- Is there an obvious production issue such as an N+1 query or avoidable sequential network calls?
- Would debugging this at 2 AM be straightforward?
- Does this match the codebase conventions?
