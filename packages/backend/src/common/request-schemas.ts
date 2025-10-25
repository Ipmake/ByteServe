import Joi from "joi";

export const FileRequestSchemas = {
    Create: Joi.object({
        bucket: Joi.string().required(),
        parent: Joi.string().allow(null).required(),
        filename: Joi.string().optional(),
        requireApiKey: Joi.boolean().optional().default(false),
    }), 
}