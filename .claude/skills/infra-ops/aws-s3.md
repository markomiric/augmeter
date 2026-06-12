# AWS S3 Setup Guide

Step-by-step guide for creating an S3 bucket with public read access for file uploads.

---

## Step 1: Access S3 Console

Open: https://s3.console.aws.amazon.com/

---

## Step 2: Create Bucket

1. Click **Create bucket**
2. Configure:
   - **Bucket name**: Globally unique name (e.g., `myapp-prod-assets`)
   - **AWS Region**: Select closest to your server
     - `eu-central-1` (Frankfurt)
     - `us-east-1` (N. Virginia)
     - `ap-southeast-1` (Singapore)
3. **Object Ownership**: Keep "ACLs disabled (recommended)"
4. **Block Public Access settings**:
   - **Uncheck** "Block all public access"
   - Check the acknowledgment box
5. Keep other defaults
6. Click **Create bucket**

---

## Step 3: Set Bucket Policy (Public Read)

1. Click your new bucket name
2. Go to **Permissions** tab
3. Scroll to **Bucket policy** → Click **Edit**
4. Paste this policy (replace `YOUR-BUCKET-NAME`):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::YOUR-BUCKET-NAME/*"
    }
  ]
}
```

5. Click **Save changes**

---

## Step 4: Create IAM User

1. Go to **IAM Console**: https://console.aws.amazon.com/iam/
2. Click **Users** → **Create user**
3. **User name**: `myapp-s3-user`
4. Click **Next**
5. **Permissions options**: Select **Attach policies directly**
6. Search and check: `AmazonS3FullAccess`
7. Click **Next** → **Create user**

---

## Step 5: Create Access Keys

1. Click the user you just created
2. Go to **Security credentials** tab
3. Scroll to **Access keys** → Click **Create access key**
4. **Use case**: Select **Application running outside AWS**
5. Click **Next**
6. **Description tag** (optional): `Production S3 access`
7. Click **Create access key**
8. **IMPORTANT**: Copy both keys immediately (secret shown only once)
   - **Access key ID** → `S3_ACCESS_KEY`
   - **Secret access key** → `S3_SECRET_ACCESS_KEY`
9. Click **Done**

---

## Step 6: Configure CORS (Optional)

If uploading directly from browser:

1. Go to your bucket → **Permissions** tab
2. Scroll to **Cross-origin resource sharing (CORS)** → Click **Edit**
3. Paste:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
    "AllowedOrigins": ["https://yourdomain.com"],
    "ExposeHeaders": ["ETag"]
  }
]
```

4. Click **Save changes**

---

## Environment Variables

```env
S3_BUCKET=your-bucket-name
S3_REGION=eu-central-1
S3_ACCESS_KEY=AKIA...
S3_SECRET_ACCESS_KEY=your-secret-key

# Optional - only needed for non-AWS S3-compatible services
S3_ENDPOINT=https://s3.eu-central-1.amazonaws.com

# Public URL for accessing files (optional - for CDN or custom domain)
S3_PUBLIC_URL=https://your-bucket-name.s3.eu-central-1.amazonaws.com
```

---

## Common Regions

| Region Code      | Location               |
| ---------------- | ---------------------- |
| `us-east-1`      | N. Virginia (cheapest) |
| `us-west-2`      | Oregon                 |
| `eu-west-1`      | Ireland                |
| `eu-central-1`   | Frankfurt              |
| `ap-southeast-1` | Singapore              |
| `ap-northeast-1` | Tokyo                  |

---

## URL Patterns

Files are accessible at:

```
https://BUCKET-NAME.s3.REGION.amazonaws.com/path/to/file.jpg
```

Example:

```
https://myapp-prod.s3.eu-central-1.amazonaws.com/uploads/image.png
```

---

## Troubleshooting

| Error                   | Solution                                  |
| ----------------------- | ----------------------------------------- |
| `Access Denied`         | Check bucket policy allows `s3:GetObject` |
| `NoSuchBucket`          | Verify bucket name and region             |
| `InvalidAccessKeyId`    | Check access key is correct               |
| `SignatureDoesNotMatch` | Check secret key, ensure no extra spaces  |
| `CORS error`            | Add CORS configuration (Step 6)           |

---

## Security Best Practices

1. **Use IAM user** (not root credentials)
2. **Principle of least privilege** - Only grant S3 access, not full AWS
3. **Never commit credentials** to version control
4. **Rotate keys periodically** in production
5. **Enable bucket versioning** for important data
6. **Use lifecycle rules** to manage old files
