param([Parameter(Mandatory = $true)][string]$InstanceId, [string]$Region = (aws configure get region))

$ErrorActionPreference = "Stop"
if (-not $Region) { throw "Configure AWS CLI first with 'aws configure' or pass -Region." }
$securityGroups = @(aws ec2 describe-instances --region $Region --instance-ids $InstanceId --query "Reservations[0].Instances[0].SecurityGroups[].GroupId" --output text).Trim().Split("`t")
if ($LASTEXITCODE -ne 0) { throw "Could not inspect instance $InstanceId." }

$confirmation = Read-Host "This permanently deletes EC2 instance $InstanceId and its TraceForge data volume. Type DELETE to continue"
if ($confirmation -cne "DELETE") {
  Write-Host "Cancelled; no AWS resources were changed."
  exit 0
}

aws ec2 terminate-instances --region $Region --instance-ids $InstanceId | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Could not terminate instance $InstanceId." }
aws ec2 wait instance-terminated --region $Region --instance-ids $InstanceId
if ($LASTEXITCODE -ne 0) { throw "Instance termination did not complete." }

foreach ($securityGroup in $securityGroups) {
  if ($securityGroup) {
    aws ec2 delete-security-group --region $Region --group-id $securityGroup | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Warning "Could not delete security group $securityGroup; remove it in the EC2 console." }
  }
}
Write-Host "EC2 instance and its attached data volume are deleted. You can launch a fresh instance next time with scripts/aws/deploy.ps1."
