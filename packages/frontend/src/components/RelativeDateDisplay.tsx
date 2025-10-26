import { Tooltip } from "@mui/material";
import Typography, { TypographyProps } from "@mui/material/Typography";
import moment from "moment";

function RelativeDateDisplay({
  date,
  props = {
    variant: "body2",
    sx: { width: "fit-content", cursor: "default"}
  }
}: {
  date: string | Date;
  props?: TypographyProps;
}) {
  return (
    <Tooltip title={moment(date).format("LLLL")} arrow placement="top">
      <Typography {...props}>
        {moment(date).fromNow()}
      </Typography>
    </Tooltip>
  );
}

export default RelativeDateDisplay;
