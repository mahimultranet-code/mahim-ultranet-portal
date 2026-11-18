# Mahim UltraNet RouterOS v7 outbound agent - TEMPLATE ONLY
# Do not import/run until staging Worker is deployed and the exact API URL + router token are issued.
# This script only modifies EXISTING Hotspot users and PPP secrets. It does not create login credentials.
# Router initiates HTTPS; do not expose API/8728 or API-SSL/8729 to the Internet.

:global ultranetApiBase "https://REPLACE-WITH-STAGING-WORKER-HOST";
:global ultranetRouterToken "REPLACE-WITH-ONE-TIME-ROUTER-TOKEN";

:if ([:len $ultranetApiBase] < 20 || [:find $ultranetApiBase "REPLACE-"] != nil) do={ :error "Set staging Worker URL first"; }
:if ([:len $ultranetRouterToken] < 40 || [:find $ultranetRouterToken "REPLACE-"] != nil) do={ :error "Set router token first"; }

:local pollResult [/tool fetch url=($ultranetApiBase . "/router/poll") http-method=get http-header-field=("Authorization: Bearer " . $ultranetRouterToken) check-certificate=yes output=user as-value];
:if (($pollResult->"status") != "finished") do={ :error "Router job poll failed"; }

:local response [:deserialize from=json value=($pollResult->"data")];
:if (($response->"ok") != true) do={ :error "Router job API returned an error"; }
:local job ($response->"job");
:if ([:typeof $job] = "nil") do={ :return; }

:local jobId ($job->"id");
:local jobType ($job->"type");
:local payload ($job->"payload");
:local username ($payload->"username");
:local serviceType ($payload->"service_type");
:local profile ($payload->"profile");
:local resultStatus "applied";
:local resultMessage "router command applied";

:onerror jobError in={
    :if ([:typeof $jobId] = "nil" || [:typeof $username] = "nil") do={ :error "Invalid job payload"; }
    :if ([:len $username] < 1 || [:len $username] > 64) do={ :error "Invalid username"; }

    :if ($jobType = "activate_hotspot" || $jobType = "emergency_activate") do={
        :if ($serviceType != "hotspot" || $profile != "Mahim-Hotspot-5M") do={ :error "Unexpected Hotspot profile"; }
        :if ([:len [/ip hotspot user profile find where name=$profile]] = 0) do={ :error "Hotspot profile missing"; }
        :local userIds [/ip hotspot user find where name=$username];
        :if ([:len $userIds] = 0) do={ :error "Existing Hotspot user missing"; }
        /ip hotspot user set ($userIds->0) profile=$profile disabled=no;
    } else={
        :if ($jobType = "activate_pppoe") do={
            :if ($serviceType != "pppoe" || $profile != "Mahim-PPPoE-10M") do={ :error "Unexpected PPPoE profile"; }
            :if ([:len [/ppp profile find where name=$profile]] = 0) do={ :error "PPPoE profile missing"; }
            :local userIds [/ppp secret find where name=$username];
            :if ([:len $userIds] = 0) do={ :error "Existing PPPoE secret missing"; }
            /ppp secret set ($userIds->0) profile=$profile disabled=no;
        } else={
            :if ($jobType = "disable_access" || $jobType = "emergency_expire") do={
                :if ($serviceType = "hotspot") do={
                    :local userIds [/ip hotspot user find where name=$username];
                    :if ([:len $userIds] = 0) do={ :error "Hotspot user missing during expiry"; }
                    /ip hotspot user set ($userIds->0) disabled=yes;
                    /ip hotspot active remove [find where user=$username];
                } else={
                    :if ($serviceType = "pppoe") do={
                        :local userIds [/ppp secret find where name=$username];
                        :if ([:len $userIds] = 0) do={ :error "PPPoE secret missing during expiry"; }
                        /ppp secret set ($userIds->0) disabled=yes;
                        /ppp active remove [find where name=$username];
                    } else={ :error "Unknown service type"; }
                }
            } else={ :error "Unsupported job type"; }
        }
    }
} do={
    :set resultStatus "failed";
    :set resultMessage "router command failed; check RouterOS log";
    :log error ("Mahim UltraNet job " . $jobId . " failed: " . $jobError);
}

/tool fetch url=($ultranetApiBase . "/router/jobs/" . $jobId . "/ack") http-method=post http-header-field=("Authorization: Bearer " . $ultranetRouterToken . ",Content-Type: application/json") http-data=("{\"status\":\"" . $resultStatus . "\",\"details\":{\"message\":\"" . $resultMessage . "\"}}") check-certificate=yes output=user;
