function _makeTable(headers, rows) {
  var headerIndex = {};
      
  for (var i = 0; i < headers.length; i++) {
    headerIndex["column:" + headers[i]] = i;
  }

  function getColumn(column_name) {
    /* TODO: Raise error if table lacks column */
    var column_index;
    Object.keys(headers).forEach(function(i) {
      if(headers[i] == column_name) { column_index = i; }
    });
    return rows.map(function(row){return row[column_index];});
  }

  function hasColumn(column_name) {
    return headerIndex.hasOwnProperty("column:" + column_name);
  }

  function getRowContentAsRecordFromHeaders(headers, raw_row) {
    /* TODO: Raise error if no row at index */
    var obj = {};
    for(var i = 0; i < headers.length; i++) {
      obj[headers[i]] = raw_row[i];
    }
    return obj;
  }

  function getRowContentAsRecord(raw_row) {
    return getRowContentAsRecordFromHeaders(headers, raw_row);
  }

  function getRowContentAsGetter(headers, raw_row) {
    var obj = getRowContentAsRecordFromHeaders(headers, raw_row);
    obj["get-value"] = function(key) {
      if(obj.hasOwnProperty(key)) {
        return obj[key];
      }
      else {
        throw "Not found: " + key;
      }
    };
    return obj;
  }

  return {
    '_headers-raw-array': headers,
    '_rows-raw-array': rows,

    'length': function(_) { return rows.length; },
    'select-columns': function(self, colnames) {
      //var colnamesList = ffi.toArray(colnames);
      // This line of code below relies on anchor built-in lists being js arrays
      var colnamesList = colnames;
      if(colnamesList.length === 0) {
        throw "zero-columns";
      }
      for(var i = 0; i < colnamesList.length; i += 1) {
        runtime.checkString(colnamesList[i]);
        if(!hasColumn(colnamesList[i])) {
          throw "no-such-column";
        }
      }
      var newRows = [];
      for(var i = 0; i < rows.length; i += 1) {
        newRows[i] = [];
        for(var j = 0; j < colnamesList.length; j += 1) {
          var colIndex = headerIndex['column:' + colnamesList[j]];
          newRows[i].push(rows[i][colIndex]);
        }
      }
      return makeTable(colnamesList, newRows);
    },

    $brand: '$table'
  };
}

module.exports = {
  '_makeTable': _makeTable
};
