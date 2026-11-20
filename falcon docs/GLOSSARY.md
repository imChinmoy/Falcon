# FALCON Glossary

- **AST:** Abstract Syntax Tree; structured representation of source syntax.
- **Symbol:** A declared code entity such as function, class, method, interface or variable.
- **Dependency edge:** A directed relationship between two graph nodes.
- **Call graph:** Graph of statically discovered function/method calls.
- **Module resolution:** Mapping an import specifier to a source module or package.
- **Direct dependent:** A node with a direct dependency relationship to a changed node.
- **Transitive dependent:** A node reachable through one or more dependency edges.
- **Impact path:** Explainable chain connecting an affected symbol to a changed symbol.
- **Precision:** Fraction of reported findings that are correct under the chosen labels.
- **Recall:** Fraction of labeled relevant findings that were discovered.
- **Static analysis:** Analysis of code without executing it.
- **Dynamic behavior:** Runtime behavior that may not be visible from static source relationships.
- **Snapshot:** Analysis model for a particular repository revision and analyzer/configuration version.
- **Diagnostic:** Message describing parse, resolution, exclusion or analysis limitation.
- **Confidence:** Strength of evidence supporting a relationship; not probability of runtime failure.
- **Risk factor:** A measurable property that may influence review priority.
- **Incremental analysis:** Recomputing only portions affected by repository changes.
