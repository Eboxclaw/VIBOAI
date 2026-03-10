use std::fs;
use std::path::{Component, Path, PathBuf};

pub const INVALID_PATH_ERROR: &str = "Invalid path: outside vault root";

pub fn validate_vault_relative_path(vault_root: &Path, user_rel: &str) -> Result<PathBuf, String> {
    let rel_path = Path::new(user_rel);

    if rel_path.is_absolute()
        || rel_path.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err(INVALID_PATH_ERROR.to_string());
    }

    let canonical_root =
        fs::canonicalize(vault_root).map_err(|_| INVALID_PATH_ERROR.to_string())?;
    let candidate = vault_root.join(rel_path);

    let resolved_candidate = canonicalize_with_existing_ancestor(&candidate)?;
    if !resolved_candidate.starts_with(&canonical_root) {
        return Err(INVALID_PATH_ERROR.to_string());
    }

    Ok(resolved_candidate)
}

fn canonicalize_with_existing_ancestor(candidate: &Path) -> Result<PathBuf, String> {
    let mut existing = candidate.to_path_buf();
    let mut missing_components = Vec::new();

    while !existing.exists() {
        if let Some(component) = existing.file_name() {
            missing_components.push(component.to_os_string());
        }

        if !existing.pop() {
            return Err(INVALID_PATH_ERROR.to_string());
        }
    }

    let mut canonical = fs::canonicalize(existing).map_err(|_| INVALID_PATH_ERROR.to_string())?;
    for component in missing_components.into_iter().rev() {
        canonical.push(component);
    }

    Ok(canonical)
}

#[cfg(test)]
mod tests {
    use super::{validate_vault_relative_path, INVALID_PATH_ERROR};

    #[test]
    fn accepts_normal_relative_path() {
        let temp = tempfile::tempdir().expect("tempdir");
        let resolved =
            validate_vault_relative_path(temp.path(), "folder/note.md").expect("valid path");
        assert!(resolved.starts_with(temp.path()));
        assert!(resolved.ends_with("folder/note.md"));
    }

    #[test]
    fn rejects_parent_traversal() {
        let temp = tempfile::tempdir().expect("tempdir");
        let err = validate_vault_relative_path(temp.path(), "../secret").expect_err("must fail");
        assert_eq!(err, INVALID_PATH_ERROR);
    }

    #[test]
    fn rejects_absolute_path() {
        let temp = tempfile::tempdir().expect("tempdir");
        let absolute = temp.path().join("outside.md");
        let err = validate_vault_relative_path(temp.path(), absolute.to_str().unwrap())
            .expect_err("must fail");
        assert_eq!(err, INVALID_PATH_ERROR);
    }

    #[test]
    fn rejects_mixed_traversal() {
        let temp = tempfile::tempdir().expect("tempdir");
        let err =
            validate_vault_relative_path(temp.path(), "safe/../escape.md").expect_err("must fail");
        assert_eq!(err, INVALID_PATH_ERROR);
    }
}
