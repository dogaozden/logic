import Lake
open Lake DSL

package «LogicProofTrainer» where
  -- Settings for the Lean 4 package
  leanOptions := #[
    ⟨`pp.unicode.fun, true⟩,
    ⟨`autoImplicit, false⟩
  ]

@[default_target]
lean_lib «LogicProofTrainer» where
  -- Library configuration
  roots := #[`LogicProofTrainer]

-- Executable for the JSON-RPC server
lean_exe «server» where
  root := `LogicProofTrainer.Server
