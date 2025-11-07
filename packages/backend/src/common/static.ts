import { $Enums } from "@prisma/client";

const StaticVars = {
    Bucket_Config_Default: [
        // { key: 'versioning', value: 'false', type: $Enums.ConfigType.BOOLEAN },
        { key: 'cache_path_caching_enable', value: 'false', type: $Enums.ConfigType.BOOLEAN },
        { key: 'cache_path_caching_ttl_seconds', value: '300', type: $Enums.ConfigType.NUMBER },
        { key: 's3_clear_empty_parents', value: 'false', type: $Enums.ConfigType.BOOLEAN },
        { key: 'files_send_folder_index', value: 'false', type: $Enums.ConfigType.BOOLEAN },
        { key: 'files_image_transform_enable', value: 'false', type: $Enums.ConfigType.BOOLEAN },
        { key: 'files_image_transform_cache_enable', value: 'false', type: $Enums.ConfigType.BOOLEAN },
        { key: 'files_image_transform_cache_ttl_seconds', value: '300', type: $Enums.ConfigType.NUMBER },
        { key: 'files_image_transform_cache_max_size', value: '10', type: $Enums.ConfigType.NUMBER },
    ],
    System_Config_Default: [
        {
            key: "site_name",
            value: "ByteServe",
            description: "The name of the site displayed in the UI",
            type: $Enums.ConfigType.STRING,
            selectOptions: [],
        },
        {
            category: "ssl",
            key: "ssl_renewal_email",
            value: "",
            description: "Email address used for Let's Encrypt SSL certificate renewal",
            type: $Enums.ConfigType.STRING,
            selectOptions: [],
        },
        {
            category: "ssl",
            key: "ssl_cert_renewal_domains",
            value: "",
            description: "Comma-separated list of domains for Let's Encrypt SSL certificate renewal",
            type: $Enums.ConfigType.STRING,
            selectOptions: [],
        },
        {
            category: "ssl",
            key: "ssl_redirect_http",
            value: "false",
            description: "Redirect HTTP traffic to HTTPS",
            type: $Enums.ConfigType.BOOLEAN,
            selectOptions: [],
        }
    ],
    System_ScheduledTasks_Default: [
        {
            id: "purge_old_objects",
            displayName: "Purge Old Objects",
            cron: "0 0 * * *", // Every day at midnight
            enabled: true
        },
        {
            id: "purge_expired_tokens",
            displayName: "Purge Expired Tokens",
            cron: "0 * * * *", // Every hour
            enabled: true
        },
        {
            id: "report_hourly_stats",
            displayName: "Report Hourly Stats",
            cron: "59 * * * *", // Every hour at minute 59
            enabled: true
        },
        {
            id: "ssl_cert_renewal",
            displayName: "SSL Certificate Renewal",
            cron: "0 0 0 * *", // Every 30 days at midnight
            enabled: false
        },
        {
            id: "migration_run_confpopulation",
            displayName: "Migration: Run Configuration Population",
            cron: "0 0 * * *", // Every day at midnight
            enabled: true
        }
    ]
}

export default StaticVars;