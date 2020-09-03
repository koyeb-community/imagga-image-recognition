/** @format */

"use strict";
const fetch = require("node-fetch");
const S3 = require("aws-sdk/clients/s3");

const recognitionFunctions = {
  "color-detection": "colors",
  "label-detection": "tags",
  "image-croppings": "croppings",
  "face-detection": "faces",
  "text-detection": "text",
  "barcodes-detection": "barcodes",
  "explicit-content-detection": "nsfw_beta",
};

const getS3Configuration = (sourceBucket) => {
  return {
    accessKeyId: process.env[`KOYEB_STORE_${sourceBucket}_ACCESS_KEY`],
    secretAccessKey: process.env[`KOYEB_STORE_${sourceBucket}_SECRET_KEY`],
    region: process.env[`KOYEB_STORE_${sourceBucket}_REGION`],
    endpoint: process.env[`KOYEB_STORE_${sourceBucket}_ENDPOINT`],
  };
};

const validateEnvironment = (sourceBucket) => {
  if (!sourceBucket) {
    throw Error("Bucket name not present in event payload.");
  }

  if (
    !process.env?.[`KOYEB_STORE_${sourceBucket}_ACCESS_KEY`] ||
    !process.env?.[`KOYEB_STORE_${sourceBucket}_SECRET_KEY`] ||
    !process.env[`KOYEB_STORE_${sourceBucket}_REGION`] ||
    !process.env[`KOYEB_STORE_${sourceBucket}_ENDPOINT`]
  ) {
    throw Error(
      `One of the following environment variables are missing: KOYEB_STORE_${sourceBucket}_ACCESS_KEY, KOYEB_STORE_${sourceBucket}_SECRET_KEY, KOYEB_STORE_${sourceBucket}_ENDPOINT, KOYEB_STORE_${sourceBucket}_REGION.`
    );
  }

  if (!process.env.IMAGGA_API_KEY || !process.env.IMAGGA_API_SECRET) {
    throw Error(
      "Environment variables IMAGGA_API_KEY and IMAGGA_API_SECRET must be set."
    );
  }
};

const imaggaImageRecognition = async (s3Instance, bucket, key) => {
  const recognitionFunction =
    process.env.IMAGGA_RECOGNITION_FUNCTION || "label-detection";

  if (!recognitionFunction in recognitionFunctions) {
    throw new Error("Uknown recognition function.");
  }

  try {
    const url = s3Instance.getSignedUrl("getObject", {
      Bucket: bucket,
      Key: key,
    });

    const authBuffer = new Buffer(
      `${process.env.IMAGGA_API_KEY}:${process.env.IMAGGA_API_SECRET}`
    );
    const authToken = authBuffer.toString("base64");

    const response = await fetch(
      `https://api.imagga.com/v2/${recognitionFunctions[recognitionFunction]}?image_url=${url}`,
      {
        headers: {
          Authorization: `Basic ${authToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(
        `Unexpected response from Imagga API: ${response.statusText}`
      );
    }

    const json = await response.json();

    await s3Instance
      .upload({
        Bucket: bucket,
        Key: `${
          process.env.IMAGGA_FILE_REFIX || "imagga-image-recognition"
        }-${recognitionFunction}-${key}.json`,
        Body: JSON.stringify(json?.result, null, 4),
        ContentType: "application/json",
      })
      .promise();
  } catch (error) {
    throw error;
  }
};

const handler = async (event) => {
  const bucket = event?.bucket?.name;
  const key = event?.object?.key;

  validateEnvironment(bucket);

  const s3Instance = new S3(getS3Configuration(bucket));
  await imaggaImageRecognition(s3Instance, bucket, key);
};

module.exports.handler = handler;
