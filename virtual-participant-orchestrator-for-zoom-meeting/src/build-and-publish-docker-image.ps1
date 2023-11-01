param (
    [string]$accountId,
    [string]$region,
    [string]$repositoryName
)

trap
{
  Write-Output $_
  exit 1
}

# Authenticate with ECR
Write-Output "Authenticate with ECR..."
Invoke-Expression -Command (Get-ECRLoginCommand).Command

New-Variable -Name builderRepoName -Value "$repositoryName"
$builderRepoName += "-builder-stage"

# Pull the images
Write-Output "Pulling $builderRepoName..."
(docker pull $builderRepoName) -or (1)

Write-Output "Pulling $repositoryName..."
(docker pull $repositoryName) -or (1)

# Build images
Write-Output "Building $builderRepoName..."
docker build --target builder --cache-from $builderRepoName -t $builderRepoName . 

Write-Output "Building $repositoryName..."
docker build --target runner --cache-from $builderRepoName --cache-from $repositoryName -t $repositoryName . 

# Build and push the
Write-Output "Push $builderRepoName to ECR..."
docker push $builderRepoName

Write-Output "Push $repositoryName to ECR..."
docker push $repositoryName

return $LASTEXITCODE