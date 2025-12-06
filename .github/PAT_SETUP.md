# Personal Access Token Setup for Downstream PRs

To enable automatic downstream PR creation, you need to configure a Personal Access Token (PAT) with the appropriate permissions.

## Why is this needed?

The default `GITHUB_TOKEN` provided by GitHub Actions only has permissions to access the current repository. To create PRs in downstream/dependent repositories, we need a PAT with broader `repo` scope.

## Steps to create and configure PAT

### 1. Create a Personal Access Token

1. Go to **GitHub Settings** → **Developer settings** → **Personal access tokens** → **Tokens (classic)**
   - Direct link: https://github.com/settings/tokens

2. Click **Generate new token** → **Generate new token (classic)**

3. Configure the token:
   - **Note**: `maven-pnpm-monorepo downstream PR automation`
   - **Expiration**: Choose your preferred expiration (90 days recommended)
   - **Scopes**: Select the following:
     - ✅ `repo` (Full control of private repositories)
       - This includes: `repo:status`, `repo_deployment`, `public_repo`, `repo:invite`, `security_events`
     - ✅ `workflow` (Update GitHub Action workflows) - Optional but recommended

4. Click **Generate token**

5. **IMPORTANT**: Copy the token immediately - you won't be able to see it again!

### 2. Add PAT to Repository Secrets

1. Go to your repository: `https://github.com/ecruz165/maven-pnpm-monorepo`

2. Navigate to **Settings** → **Secrets and variables** → **Actions**

3. Click **New repository secret**

4. Configure the secret:
   - **Name**: `PAT_TOKEN`
   - **Value**: Paste the token you copied in step 1
   - Click **Add secret**

### 3. Verify Setup

After adding the secret, the next workflow run will automatically use the PAT for downstream PR operations. You can verify by:

1. Making a change to any module (e.g., `demo-module-a`)
2. Creating a changeset
3. Pushing to main
4. Checking the workflow run - the "Create Downstream PRs" job should now succeed

## Security Notes

- The PAT grants access to all repositories the user has access to
- Store the token securely and never commit it to the repository
- Use fine-grained expiration dates and rotate tokens regularly
- Consider using a dedicated bot account for automation if working in a team environment

## Alternative: Fine-grained Personal Access Tokens (Beta)

GitHub now offers fine-grained PATs that allow more granular permissions:

1. Go to **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens**
2. Click **Generate new token**
3. Configure:
   - **Token name**: `maven-pnpm-monorepo-automation`
   - **Expiration**: 90 days
   - **Repository access**: Select specific repositories
   - **Permissions**:
     - Repository permissions → **Contents**: Read and write
     - Repository permissions → **Pull requests**: Read and write
4. Generate and add to secrets as `PAT_TOKEN`

## Troubleshooting

### "Permission denied" errors
- Verify the PAT has `repo` scope enabled
- Ensure the PAT hasn't expired
- Check that the secret name is exactly `PAT_TOKEN`

### PR creation fails
- Verify the dependent repository exists and you have write access
- Check that the DEPENDENTS.yaml configuration is correct
- Review workflow logs for detailed error messages
