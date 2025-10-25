import { S3WorkerHandlers_DeleteObject } from "./handlers/DeleteObject";
import { S3WorkerHandlers_GetObject } from "./handlers/GetObject";
import { S3WorkerHandlers_ListBuckets } from "./handlers/ListBuckets";
import { S3WorkerHandlers_ListObjectsV2 } from "./handlers/ListObjectsV2";
import { S3WorkerHandlers_PostMultiPartUpload, S3WorkerHandlers_PutMultiPartUpload } from "./handlers/MultiPartUpload";

export default class S3Worker {
    public static DeleteObject = S3WorkerHandlers_DeleteObject;
    public static GetObject = S3WorkerHandlers_GetObject;
    public static ListBuckets = S3WorkerHandlers_ListBuckets;
    public static ListObjectsV2 = S3WorkerHandlers_ListObjectsV2;
    public static PostMultiPartUpload = S3WorkerHandlers_PostMultiPartUpload;
    public static PutMultiPartUpload = S3WorkerHandlers_PutMultiPartUpload;
}