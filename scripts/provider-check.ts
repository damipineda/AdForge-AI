import assert from "node:assert/strict";
import { metaImageModel, metaTextModel } from "../src/lib/pipeline/meta";

process.env.MUSE_SPARK_MODEL = "muse-spark-1.3";
process.env.MUSE_IMAGE_MODEL = "muse-image-1.0";
assert.equal(metaTextModel(), "muse-spark-1.3");
assert.equal(metaImageModel(), "muse-image-1.0");
process.env.MUSE_SPARK_MODEL = "unrelated-model";
process.env.MUSE_IMAGE_MODEL = "unrelated-model";
assert.throws(metaTextModel, /Muse Spark/);
assert.throws(metaImageModel, /Muse Image/);
console.log("OK · solo se aceptan modelos Muse Spark y Muse Image");
